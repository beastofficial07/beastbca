// ════════════════════════════════════════════════════════════════════════════
// PAYMENTS ROUTES — Razorpay integration for player registration
// POST /api/payments/create-order   — create a Razorpay order
// POST /api/payments/verify-payment — verify signature & save player
// GET  /api/payments/order/:orderId — check order status
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');
const router  = express.Router();
const Player  = require('../models/Player');
const { createOrder, verifyPaymentSignature, getOrderStatus } = require('../utils/razorpay');

// Registration fee in INR
const REGISTRATION_FEE_INR = Number(process.env.PLAYER_REGISTRATION_FEE) || 500;

// ── POST /api/payments/create-order ──────────────────────────────────────────
// Body: { name, email, phone, auctionId, role, category, nationality, age,
//         basePrice, stats }
// Creates a Razorpay order and returns the order details to the frontend so
// the Razorpay checkout widget can be launched.
router.post('/create-order', async (req, res) => {
  try {
    const {
      name, email, phone, auctionId,
      role, category, nationality, age, basePrice,
    } = req.body;

    // Basic validation
    if (!name || !email || !auctionId || !role || !category || !basePrice) {
      return res.status(400).json({
        error: 'name, email, auctionId, role, category and basePrice are required.',
      });
    }

    // Build a short receipt string (Razorpay limit: 40 chars)
    const receipt = `preg_${Date.now()}`.slice(0, 40);

    const notes = {
      playerName:  name,
      email:       email || '',
      phone:       phone || '',
      auctionId:   String(auctionId),
      role,
      category,
      nationality: nationality || 'Indian',
      age:         String(age || ''),
      basePrice:   String(basePrice),
    };

    const order = await createOrder(REGISTRATION_FEE_INR, receipt, notes);

    return res.json({
      success:  true,
      orderId:  order.id,
      amount:   order.amount,       // in paise
      currency: order.currency,
      receipt:  order.receipt,
      keyId:    process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('❌ create-order error:', err.message);

    if (err.message.includes('not configured')) {
      return res.status(503).json({ error: 'Payment service is not configured. Contact support.' });
    }

    return res.status(500).json({ error: 'Failed to create payment order. Please try again.' });
  }
});

// ── POST /api/payments/verify-payment ────────────────────────────────────────
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature,
//         playerData: { name, email, phone, auctionId, role, category,
//                       nationality, age, basePrice, imageUrl, stats } }
// Verifies the Razorpay HMAC signature. On success, saves the player to the
// database with paymentStatus = 'paid'.
router.post('/verify-payment', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      playerData,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        error: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required.',
      });
    }

    if (!playerData || !playerData.auctionId || !playerData.name) {
      return res.status(400).json({ error: 'playerData with auctionId and name is required.' });
    }

    // Verify the payment signature
    const isValid = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      console.warn('⚠️  Invalid Razorpay signature for order:', razorpay_order_id);
      return res.status(400).json({
        success: false,
        error:   'Payment verification failed. Invalid signature.',
      });
    }

    // Check for duplicate payment (idempotency)
    const existing = await Player.findOne({ razorpayOrderId: razorpay_order_id });
    if (existing) {
      console.log('ℹ️  Duplicate payment callback for order:', razorpay_order_id);
      return res.json({ success: true, player: existing, duplicate: true });
    }

    // Save the player with payment details
    const player = new Player({
      auctionId:         playerData.auctionId,
      name:              playerData.name,
      role:              playerData.role       || 'Other',
      category:          playerData.category   || 'Emerging',
      nationality:       playerData.nationality || 'Indian',
      age:               playerData.age         || undefined,
      basePrice:         Number(playerData.basePrice) || 0,
      imageUrl:          playerData.imageUrl    || undefined,
      stats:             playerData.stats       || {},
      status:            'pending',             // awaits auction start
      // Payment fields
      razorpayOrderId:   razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      paymentStatus:     'paid',
      paymentAmount:     REGISTRATION_FEE_INR,
      paymentDate:       new Date(),
      registrantEmail:   playerData.email || '',
      registrantPhone:   playerData.phone || '',
    });

    await player.save();
    console.log('✅ Player registered after payment:', player.name, '| Order:', razorpay_order_id);

    return res.status(201).json({
      success: true,
      message: 'Payment verified and player registered successfully.',
      player,
    });
  } catch (err) {
    console.error('❌ verify-payment error:', err.message);
    return res.status(500).json({ error: 'Payment verification failed. Please contact support.' });
  }
});

// ── GET /api/payments/order/:orderId ─────────────────────────────────────────
// Returns the current status of a Razorpay order (created / attempted / paid).
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) return res.status(400).json({ error: 'orderId is required.' });

    const order = await getOrderStatus(orderId);

    // Also check if we have a player record for this order
    const player = await Player.findOne({ razorpayOrderId: orderId }).lean();

    return res.json({
      success: true,
      order: {
        id:       order.id,
        status:   order.status,
        amount:   order.amount,
        currency: order.currency,
        receipt:  order.receipt,
      },
      player: player || null,
    });
  } catch (err) {
    console.error('❌ order-status error:', err.message);

    if (err.message.includes('not configured')) {
      return res.status(503).json({ error: 'Payment service is not configured.' });
    }

    return res.status(500).json({ error: 'Failed to fetch order status.' });
  }
});

module.exports = router;
