const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  // ── Core auction fields ───────────────────────────────────────────────────
  auctionId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Auction', required: true },
  name:        { type: String, required: true },
  role:        { type: String, enum: ['Batsman', 'Bowler', 'AllRounder', 'WicketKeeper', 'Other'], required: true },
  category:    { type: String, enum: ['Elite', 'Gold', 'Silver', 'Emerging'], required: true },
  nationality: { type: String, default: 'Indian' },
  age:         { type: Number, default: null },
  basePrice:   { type: Number, required: true },
  soldPrice:   { type: Number, default: null },
  imageUrl:    { type: String, default: null },
  status:      { type: String, enum: ['pending', 'active', 'sold', 'unsold'], default: 'pending' },
  teamId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  stats: {
    matches:    { type: Number, default: 0 },
    runs:       { type: Number, default: 0 },
    wickets:    { type: Number, default: 0 },
    average:    { type: Number, default: 0 },
    strikeRate: { type: Number, default: 0 },
    economy:    { type: Number, default: 0 },
  },

  // ── Payment fields (Razorpay) ─────────────────────────────────────────────
  // paymentStatus: 'unpaid'  — registered without payment (legacy / admin-added)
  //                'pending' — order created, awaiting payment confirmation
  //                'paid'    — payment verified via Razorpay signature
  //                'failed'  — payment failed or signature mismatch
  paymentStatus:     { type: String, enum: ['unpaid', 'pending', 'paid', 'failed'], default: 'unpaid' },
  razorpayOrderId:   { type: String, default: null, index: true },
  razorpayPaymentId: { type: String, default: null },
  paymentAmount:     { type: Number, default: null },   // INR amount charged
  paymentDate:       { type: Date,   default: null },
  registrantEmail:   { type: String, default: '' },     // email of person who registered
  registrantPhone:   { type: String, default: '' },
}, { timestamps: true });

// A player can only enter an active auction after payment is verified
playerSchema.virtual('isPaymentVerified').get(function () {
  return this.paymentStatus === 'paid';
});

module.exports = mongoose.model('Player', playerSchema);

