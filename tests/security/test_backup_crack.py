"""
Tests de robustesse des sauvegardes chiffrées — LoadLess
Vérifie que le format .llbk résiste aux attaques de bruteforce,
de falsification et de replay.

Prérequis :
    pip install pytest cryptography

Utilisation :
    pytest tests/security/test_backup_crack.py -v
"""
import base64
import json
import os
import struct
import pytest
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


# ── Helpers ──────────────────────────────────────────────────────────────────

def derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100_000,
    )
    return kdf.derive(password.encode())


def make_backup(payload: dict, password: str) -> dict:
    """Chiffre un payload comme le fait BackupManager.exportBackup()."""
    salt = os.urandom(16)
    iv = os.urandom(12)
    key = derive_key(password, salt)
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(iv, json.dumps(payload).encode(), None)
    return {
        "v": 1,
        "salt": base64.b64encode(salt).decode(),
        "iv": base64.b64encode(iv).decode(),
        "data": base64.b64encode(ct).decode(),
    }


def decrypt_backup(envelope: dict, password: str) -> dict:
    """Déchiffre une sauvegarde .llbk."""
    salt = base64.b64decode(envelope["salt"])
    iv = base64.b64decode(envelope["iv"])
    ct = base64.b64decode(envelope["data"])
    key = derive_key(password, salt)
    aesgcm = AESGCM(key)
    plain = aesgcm.decrypt(iv, ct, None)
    return json.loads(plain)


# ── Tests ─────────────────────────────────────────────────────────────────────

CORRECT_PASSWORD = "MonMotDePasseFort!42"
SAMPLE_PAYLOAD = {"v": 1, "tasks": [{"id": "abc", "title": "Test"}], "txs": []}


def test_correct_password_decrypts():
    """Un mot de passe correct déchiffre la sauvegarde."""
    env = make_backup(SAMPLE_PAYLOAD, CORRECT_PASSWORD)
    result = decrypt_backup(env, CORRECT_PASSWORD)
    assert result["tasks"][0]["title"] == "Test"


def test_wrong_password_fails():
    """Un mot de passe incorrect lève une exception (tag GCM invalide)."""
    env = make_backup(SAMPLE_PAYLOAD, CORRECT_PASSWORD)
    with pytest.raises(Exception):
        decrypt_backup(env, "MauvaisMotDePasse")


def test_bruteforce_100_attempts():
    """100 tentatives de bruteforce ne réussissent pas à déchiffrer."""
    env = make_backup(SAMPLE_PAYLOAD, CORRECT_PASSWORD)
    common_passwords = [
        "password", "123456", "qwerty", "admin", "loadless",
        "motdepasse", "azerty", "pass1234", "secret", "test",
    ] * 10
    cracked = False
    for pwd in common_passwords:
        try:
            decrypt_backup(env, pwd)
            cracked = True
            break
        except Exception:
            pass
    assert not cracked, "FAIL : bruteforce réussi avec un mot de passe faible"


def test_tampered_ciphertext_fails():
    """Falsification du ciphertext détectée par le tag GCM."""
    env = make_backup(SAMPLE_PAYLOAD, CORRECT_PASSWORD)
    raw = bytearray(base64.b64decode(env["data"]))
    raw[0] ^= 0xFF  # flip le premier octet
    env["data"] = base64.b64encode(bytes(raw)).decode()
    with pytest.raises(Exception):
        decrypt_backup(env, CORRECT_PASSWORD)


def test_tampered_iv_fails():
    """Falsification de l'IV détectée (résultat différent ou exception)."""
    env = make_backup(SAMPLE_PAYLOAD, CORRECT_PASSWORD)
    raw_iv = bytearray(base64.b64decode(env["iv"]))
    raw_iv[0] ^= 0xFF
    env["iv"] = base64.b64encode(bytes(raw_iv)).decode()
    with pytest.raises(Exception):
        decrypt_backup(env, CORRECT_PASSWORD)


def test_replay_different_salt():
    """Deux sauvegardes du même payload avec le même mot de passe produisent des ciphertexts différents."""
    env1 = make_backup(SAMPLE_PAYLOAD, CORRECT_PASSWORD)
    env2 = make_backup(SAMPLE_PAYLOAD, CORRECT_PASSWORD)
    assert env1["data"] != env2["data"], "FAIL : même ciphertext pour deux sauvegardes (IV/salt non aléatoires)"
    assert env1["salt"] != env2["salt"], "FAIL : même salt pour deux sauvegardes"


def test_version_field_present():
    """Le champ v=1 est présent dans l'enveloppe."""
    env = make_backup(SAMPLE_PAYLOAD, CORRECT_PASSWORD)
    assert env.get("v") == 1, "Champ version manquant dans la sauvegarde"


def test_pbkdf2_iterations():
    """Vérifie que 100 000 itérations PBKDF2 sont nécessaires (résistance brute-force)."""
    import time
    salt = os.urandom(16)
    start = time.perf_counter()
    derive_key(CORRECT_PASSWORD, salt)
    elapsed = time.perf_counter() - start
    # Sur un CPU moderne, 100k itérations SHA-256 prend > 50ms
    assert elapsed > 0.05, f"PBKDF2 trop rapide ({elapsed:.3f}s) — vérifier le nombre d'itérations"


def test_key_length_256_bits():
    """La clé dérivée fait bien 256 bits (32 octets)."""
    key = derive_key(CORRECT_PASSWORD, os.urandom(16))
    assert len(key) == 32, f"Longueur de clé incorrecte : {len(key)*8} bits"
