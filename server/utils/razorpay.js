// ════════════════════════════════════════════════════════════════════════════
// RAZORPAY UTILITY — order creation, payment verification, order status
// ════════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');

const RAZORPAY_KEY_ID     = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// Lazily initialise the Razorpay SDK so the server still boots when the env
// vars are absent (they will be validated per-request instead).
let _razorpay = null;

function getRazorpay() {
  if (_razorpay) return _razorpay;

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error(
      'Razorpay credentials are not configured. ' +
      'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables.'
    );
  }

  const Razorpay = require('razorpay');
  _razorpay = new Razorpay({
    key_id:     RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
  });

  console.log('✅ Razorpay initialised with key:', RAZORPAY_KEY_ID);
  return _razorpay;
}

// ── createOrder ───────────────────────────────────────────────────────────────
// amount   : amount in INR (will be converted to paise internally)
// receipt  : short unique string for your records (max 40 chars)
// notes    : arbitrary key-value object stored on the Razorpay order
async function createOrder(amount, receipt = 'player_reg', notes = {}) {
  const razorpay = getRazorpay();

  const options = {
    amount:   Math.round(amount * 100), // Razorpay expects paise
    currency: 'INR',
    receipt:  receipt.slice(0, 40),     // Razorpay limit
    notes,
  };

  console.log('📦 Creating Razorpay order:', options);
  const order = await razorpay.orders.create(options);
  console.log('✅ Razorpay order created:', order.id);
  return order;
}

// ── verifyPaymentSignature ────────────────────────────────────────────────────
// Validates the HMAC-SHA256 signature that Razorpay sends after a successful
// payment. Returns true if valid, false otherwise.
function verifyPaymentSignature(orderId, paymentId, signature) {
  if (!RAZORPAY_KEY_SECRET) {
    throw new Error('RAZORPAY_KEY_SECRET is not set.');
  }

  const body    = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  const isValid = expected === signature;
  console.log(`🔐 Signature verification for order ${orderId}: ${isValid ? '✅ valid' : '❌ invalid'}`);
  return isValid;
}

// ── getOrderStatus ────────────────────────────────────────────────────────────
// Fetches the current status of a Razorpay order by its ID.
async function getOrderStatus(orderId) {
  const razorpay = getRazorpay();
  console.log('🔍 Fetching Razorpay order status for:', orderId);
  const order = await razorpay.orders.fetch(orderId);
  console.log('✅ Order status:', order.status);
  return order;
}

module.exports = { createOrder, verifyPaymentSignature, getOrderStatus };
