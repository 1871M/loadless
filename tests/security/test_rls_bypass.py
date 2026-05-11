"""
Tests de contournement RLS — LoadLess
Vérifie que les politiques tx_block_direct_insert/update/delete
bloquent bien les accès directs à la table transactions.

Prérequis :
    pip install supabase pytest

Utilisation :
    export SURL="https://lalpmkyxzapiheadvckp.supabase.co"
    export SKEY_ANON="<anon_key>"
    export TEST_EMAIL="test@example.com"
    export TEST_PASSWORD="testpassword123"
    pytest tests/security/test_rls_bypass.py -v
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


@pytest.fixture(scope="module")
def auth_client():
    """Client Supabase authentifié avec un compte utilisateur réel."""
    sb = create_client(SURL, SKEY)
    res = sb.auth.sign_in_with_password({"email": EMAIL, "password": PASSWORD})
    assert res.user is not None, "Authentification échouée"
    yield sb
    sb.auth.sign_out()


def test_direct_insert_blocked(auth_client):
    """RLS tx_block_direct_insert : l'insert direct doit retourner une erreur."""
    try:
        res = auth_client.table("transactions").insert({
            "couple_id": "00000000-0000-0000-0000-000000000000",
            "account_id": "00000000-0000-0000-0000-000000000001",
            "title": "bypass_test",
            "amount": 1.0,
            "type": "expense",
        }).execute()
        # Si aucune exception, vérifier que aucune ligne n'a été insérée
        assert len(res.data) == 0, "FAIL : insert direct accepté — RLS tx_block_direct_insert inopérant"
    except Exception as e:
        # L'erreur est le comportement attendu
        assert "42501" in str(e) or "row-level security" in str(e).lower() or "permission" in str(e).lower(), \
            f"Erreur inattendue : {e}"


def test_direct_update_blocked(auth_client):
    """RLS tx_block_direct_update : la mise à jour directe doit être bloquée."""
    try:
        res = auth_client.table("transactions").update({"title": "hacked"}).eq("id", "00000000-0000-0000-0000-000000000000").execute()
        assert len(res.data) == 0, "FAIL : update direct accepté — RLS tx_block_direct_update inopérant"
    except Exception as e:
        assert "42501" in str(e) or "row-level security" in str(e).lower() or "permission" in str(e).lower(), \
            f"Erreur inattendue : {e}"


def test_direct_delete_blocked(auth_client):
    """RLS tx_block_direct_delete : la suppression directe doit être bloquée."""
    try:
        res = auth_client.table("transactions").delete().eq("id", "00000000-0000-0000-0000-000000000000").execute()
        assert len(res.data) == 0, "FAIL : delete direct accepté — RLS tx_block_direct_delete inopérant"
    except Exception as e:
        assert "42501" in str(e) or "row-level security" in str(e).lower() or "permission" in str(e).lower(), \
            f"Erreur inattendue : {e}"


def test_rpc_add_transaction_secure_unauthorized_couple(auth_client):
    """add_transaction_secure : refus si couple_id ne correspond pas à l'utilisateur."""
    res = auth_client.rpc("add_transaction_secure", {
        "p_couple_id": "00000000-0000-0000-0000-000000000000",
        "p_account_id": "00000000-0000-0000-0000-000000000001",
        "p_title": "bypass_rpc",
        "p_amount": 1.0,
        "p_type": "expense",
        "p_category": "autre",
        "p_note": "",
        "p_tx_date": "2026-01-01",
    }).execute()
    data = res.data
    assert isinstance(data, dict), f"Réponse inattendue : {data}"
    assert data.get("error") in ("unauthorized", "account_not_found"), \
        f"FAIL : RPC accepté avec couple_id inconnu — réponse : {data}"


def test_cross_couple_read_blocked(auth_client):
    """SELECT inter-couple : un utilisateur ne peut pas lire les transactions d'un autre couple."""
    # On tente de lire toutes les transactions sans filtre — RLS doit ne retourner que les siennes
    res = auth_client.table("transactions").select("id,couple_id").limit(50).execute()
    rows = res.data or []
    # Récupérer le couple_id de l'utilisateur courant
    user_id = auth_client.auth.get_user().user.id
    couple_res = auth_client.table("couples").select("id").or_(
        f"partner1_id.eq.{user_id},partner2_id.eq.{user_id}"
    ).execute()
    couple_ids = {c["id"] for c in (couple_res.data or [])}
    for row in rows:
        assert row["couple_id"] in couple_ids, \
            f"FAIL : transaction d'un autre couple visible — couple_id={row['couple_id']}"
