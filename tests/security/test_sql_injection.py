"""
Tests d'injection SQL — LoadLess
Vérifie que les RPCs et les requêtes paramétrées résistent aux
charges d'injection SQL classiques.

Prérequis :
    pip install supabase pytest

Utilisation :
    export SURL="https://lalpmkyxzapiheadvckp.supabase.co"
    export SKEY_ANON="<anon_key>"
    export TEST_EMAIL="test@example.com"
    export TEST_PASSWORD="testpassword123"
    pytest tests/security/test_sql_injection.py -v
"""
import os
import pytest
from supabase import create_client

SURL = os.environ.get("SURL", "https://lalpmkyxzapiheadvckp.supabase.co")
SKEY = os.environ.get("SKEY_ANON", "")
EMAIL = os.environ.get("TEST_EMAIL", "")
PASSWORD = os.environ.get("TEST_PASSWORD", "")

if not SKEY or not EMAIL or not PASSWORD:
    pytest.skip("Variables d'environnement manquantes : SKEY_ANON, TEST_EMAIL, TEST_PASSWORD", allow_module_level=True)

# Charges d'injection à tester
SQL_PAYLOADS = [
    "' OR '1'='1",
    "'; DROP TABLE transactions; --",
    "' UNION SELECT * FROM auth.users --",
    "1; SELECT pg_sleep(5) --",
    "' OR 1=1 --",
    "<script>alert(1)</script>",
    "\\x27 OR \\x271\\x27=\\x271",
    "'; INSERT INTO security_logs VALUES ('pwned'); --",
]


@pytest.fixture(scope="module")
def auth_client():
    sb = create_client(SURL, SKEY)
    res = sb.auth.sign_in_with_password({"email": EMAIL, "password": PASSWORD})
    assert res.user is not None, "Authentification échouée"
    yield sb
    sb.auth.sign_out()


@pytest.mark.parametrize("payload", SQL_PAYLOADS)
def test_rpc_title_injection(auth_client, payload):
    """Injection dans le champ title de add_transaction_secure."""
    res = auth_client.rpc("add_transaction_secure", {
        "p_couple_id": "00000000-0000-0000-0000-000000000000",
        "p_account_id": "00000000-0000-0000-0000-000000000001",
        "p_title": payload,
        "p_amount": 1.0,
        "p_type": "expense",
        "p_category": "autre",
        "p_note": "",
        "p_tx_date": "2026-01-01",
    }).execute()
    data = res.data
    # Doit retourner une erreur métier (unauthorized/account_not_found), pas une fuite SQL
    assert isinstance(data, dict), f"Réponse inattendue avec payload {payload!r}: {data}"
    assert "error" in data, f"Pas d'erreur retournée pour payload {payload!r}: {data}"
    # S'assurer que le message d'erreur ne fuit pas d'infos SQL
    error_val = str(data.get("error", "")) + str(data.get("message", ""))
    forbidden_leaks = ["pg_sleep", "auth.users", "pg_catalog", "information_schema"]
    for leak in forbidden_leaks:
        assert leak not in error_val.lower(), f"Fuite SQL détectée avec payload {payload!r}: {error_val}"


@pytest.mark.parametrize("payload", SQL_PAYLOADS)
def test_task_title_injection(auth_client, payload):
    """Injection dans le champ title d'une tâche (insert direct paramétré via PostgREST)."""
    try:
        res = auth_client.table("tasks").insert({
            "couple_id": "00000000-0000-0000-0000-000000000000",
            "title": payload,
            "category": "autre",
            "priority": "low",
        }).execute()
        # RLS doit bloquer ou retourner 0 lignes
        assert len(res.data) == 0, f"Insertion acceptée pour payload {payload!r}"
    except Exception as e:
        err = str(e).lower()
        forbidden_leaks = ["pg_sleep", "auth.users", "pg_catalog", "information_schema"]
        for leak in forbidden_leaks:
            assert leak not in err, f"Fuite SQL dans exception pour payload {payload!r}: {e}"


@pytest.mark.parametrize("payload", SQL_PAYLOADS)
def test_filter_injection(auth_client, payload):
    """Injection dans un filtre .eq() PostgREST (requête paramétrée côté PostgREST)."""
    try:
        res = auth_client.table("transactions").select("id").eq("title", payload).limit(10).execute()
        # Le filtre doit être traité comme une chaîne littérale — pas de résultats inattendus
        rows = res.data or []
        for row in rows:
            assert "id" in row, f"Structure de réponse inattendue pour payload {payload!r}"
    except Exception as e:
        err = str(e).lower()
        assert "syntax error" not in err, f"Erreur de syntaxe SQL exposée pour payload {payload!r}: {e}"
