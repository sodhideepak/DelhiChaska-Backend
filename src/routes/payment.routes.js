// import { createCheckoutSession, stripeWebhook } from "../controllers/paymentController.js";
import { Router } from "express";
import express from "express";

import { validateApiKey } from "../middlewares/validateapi.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { verifyStaffJWT } from "../middlewares/authstaff.middleware.js";

import {
  createCheckoutSession,
  stripeWebhook,
} from "../controllers/payment.controller.js";

const router = Router();

router.use(validateApiKey)
// Create Stripe Checkout Session
// router.post(
//   "/create-checkout-session",verifyJWT,
//   createCheckoutSession
// );

router.route("/create-checkout-session").post(verifyJWT,createCheckoutSession)



// Stripe Webhook
// router.post(
//   "/webhook",
//   express.raw({ type: "application/json" }),
//   stripeWebhook
// );

export default router;