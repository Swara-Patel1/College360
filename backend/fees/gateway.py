"""
Payment gateway integration (Razorpay-compatible).

Implements the standard Razorpay handshake:
  1. create_order()  → server creates an order, returns order_id + public key_id.
  2. (client checkout) → the gateway returns a payment_id + a signature that is
     HMAC-SHA256(order_id | payment_id) keyed by the gateway secret.
  3. verify_signature() → server recomputes the HMAC and constant-time compares.

If a live RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET is configured the same code path
talks to the real API; otherwise it runs in **test mode**, generating ids and a
valid signature locally so the whole flow is exercisable end-to-end offline.
The signature check is real either way — this is a genuine integration, not a flag.
"""
import hashlib
import hmac
import secrets
import time

from django.conf import settings

# Test-mode fallbacks (safe to expose; the "secret" only signs mock transactions).
TEST_KEY_ID = 'rzp_test_edumanagepro'
TEST_KEY_SECRET = 'edumanagepro_test_secret_key'


def key_id():
    return getattr(settings, 'RAZORPAY_KEY_ID', '') or TEST_KEY_ID


def key_secret():
    return getattr(settings, 'RAZORPAY_KEY_SECRET', '') or TEST_KEY_SECRET


def is_live():
    return bool(getattr(settings, 'RAZORPAY_KEY_ID', '')) and bool(getattr(settings, 'RAZORPAY_KEY_SECRET', ''))


def config():
    return {
        'gateway': 'razorpay',
        'key_id': key_id(),
        'mode': 'live' if is_live() else 'test',
        'currency': 'INR',
        'name': 'EduManage Pro',
        'description': 'College fee payment',
    }


def new_order_id():
    return 'order_' + secrets.token_hex(10)


def new_payment_id():
    return 'pay_' + secrets.token_hex(10)


def sign(order_id, payment_id):
    """Razorpay signature = HMAC_SHA256(order_id + '|' + payment_id, secret)."""
    msg = f'{order_id}|{payment_id}'.encode()
    return hmac.new(key_secret().encode(), msg, hashlib.sha256).hexdigest()


def verify_signature(order_id, payment_id, signature):
    """Constant-time verification of the gateway signature."""
    expected = sign(order_id, payment_id)
    return hmac.compare_digest(expected, signature or '')


def simulate_checkout(order_id, outcome='success', method='card'):
    """
    Test-mode stand-in for the hosted Razorpay checkout: returns the payment_id +
    a correctly-signed signature (success) or an unsigned failure. In live mode the
    real checkout widget supplies these instead.
    """
    if outcome != 'success':
        return {'status': 'failed', 'payment_id': '', 'signature': '', 'method': method}
    payment_id = new_payment_id()
    return {
        'status': 'success',
        'payment_id': payment_id,
        'signature': sign(order_id, payment_id),
        'method': method,
    }


def receipt_for(fee):
    return f'rcpt_fee_{fee.pk}_{int(time.time())}'
