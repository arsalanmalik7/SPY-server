import express from 'express';
import { createPaymentIntent, getPlans, createCheckoutSession, stripeWebhook, getAllTransactions } from '../controllers/stripeController.mjs';

const router = express.Router();

router.get('/plans', getPlans);
router.get('/transactions', getAllTransactions);
router.post('/create-checkout-session', createCheckoutSession);
router.post('/create-payment-intent', createPaymentIntent);

export default router; 