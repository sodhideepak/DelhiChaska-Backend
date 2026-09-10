import Stripe from "stripe";

import { Order } from "../models/order.model.js";
import { asynchandler } from "../utils/asynchandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";


// ============================================================
// STRIPE INSTANCE
// ============================================================

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


// ============================================================
// CREATE STRIPE CHECKOUT SESSION
// ============================================================

const createCheckoutSession = asynchandler(async (req, res) => {

    console.log(req);
    const userId = req.user._id;

    const { orderId } = req.body;


    // ==========================
    // 🔍 VALIDATE ORDER ID
    // ==========================

    if (!orderId) {
        throw new ApiError(
            400,
            "order id is required"
        );
    }


    // ==========================
    // 🔍 FETCH ORDER
    // ==========================

    const order = await Order.findOne({
        _id: orderId,
        userId
    });

    if (!order) {
        throw new ApiError(
            404,
            "order not found"
        );
    }


    // ==========================
    // 💳 CHECK PAYMENT METHOD
    // ==========================

    if (order.payment.method !== "online") {
        throw new ApiError(
            400,
            "order is not configured for online payment"
        );
    }


    // ==========================
    // 💰 CHECK PAYMENT STATUS
    // ==========================

    if (order.payment.status === "paid") {
        throw new ApiError(
            400,
            "order is already paid"
        );
    }


    // ==========================
    // 💰 VALIDATE TOTAL
    // ==========================

    const totalAmount = Number(
        order.totalAmount
    );

    if (
        !Number.isFinite(totalAmount) ||
        totalAmount <= 0
    ) {
        throw new ApiError(
            400,
            "invalid order amount"
        );
    }


    // ==========================
    // 💵 USD → CENTS
    // ==========================
    //
    // Example:
    //
    // $10.00 → 1000
    // $29.99 → 2999
    //
    // Stripe uses the smallest currency unit.
    // ==========================

    const amountInCents =
        Math.round(totalAmount * 100);


    // ==========================
    // 🛒 BUILD LINE ITEMS
    // ==========================

    const lineItems = order.items.map((item) => {

        return {
            price_data: {

                currency: "usd",

                product_data: {
                    name: item.name || "Product"
                },

                unit_amount:
                    Math.round(
                        Number(item.selectedVariant?.price || 0) * 100
                    )
            },

            quantity: item.quantity || 1
        };

    });


    // ==========================
    // ⚠️ FALLBACK
    // ==========================
    //
    // If your items don't contain
    // usable variant prices, use
    // the complete order total.
    // ==========================

    const validLineItems =
        lineItems.every(
            (item) =>
                item.price_data.unit_amount > 0
        );


    // ==========================
    // 💳 CREATE STRIPE SESSION
    // ==========================

    const session =
        await stripe.checkout.sessions.create({

            mode: "payment",

            line_items: validLineItems
                ? lineItems
                : [
                    {
                        price_data: {

                            currency: "usd",

                            product_data: {
                                name: `Order #${order._id}`
                            },

                            unit_amount:
                                amountInCents
                        },

                        quantity: 1
                    }
                ],


            // ======================
            // 🔗 CONNECT ORDER
            // ======================

            metadata: {
                orderId:
                    order._id.toString(),

                userId:
                    userId.toString()
            },


            // ======================
            // ✅ SUCCESS
            // ======================

            success_url:
                `${process.env.FRONTEND_URL}/payment/success` +
                `?session_id={CHECKOUT_SESSION_ID}` +
                `&order_id=${order._id}`,


            // ======================
            // ❌ CANCEL
            // ======================

            cancel_url:
                `${process.env.FRONTEND_URL}/payment/cancel` +
                `?order_id=${order._id}`,


            // ======================
            // 📍 BILLING ADDRESS
            // ======================

            billing_address_collection:
                "auto"
        });


    // ==========================
    // 💾 SAVE STRIPE SESSION
    // ==========================

    order.payment.stripeSessionId =
        session.id;

    await order.save();


    // ==========================
    // 📤 RESPONSE
    // ==========================

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                sessionId: session.id,
                url: session.url
            },
            "stripe checkout session created successfully"
        )
    );

});


// ============================================================
// STRIPE WEBHOOK
// ============================================================

// ============================================================
// STRIPE WEBHOOK
// ============================================================

// const stripeWebhook = asynchandler(
//     async (req, res) => {




//          console.log("🔥🔥🔥 WEBHOOK WAS CALLED 🔥🔥🔥");
//         // ======================================================
//         // 🔐 GET STRIPE SIGNATURE
//         // ======================================================

//         const signature =
//             req.headers["stripe-signature"];


//         if (!signature) {

//             console.error(
//                 "stripe signature missing"
//             );

//             return res.status(400).json({
//                 success: false,
//                 message: "stripe signature missing"
//             });
//         }


//         // ======================================================
//         // 🔐 VERIFY WEBHOOK
//         // ======================================================

//         let event;

//         try {

//             event =
//                 stripe.webhooks.constructEvent(
//                     req.body,
//                     signature,
//                     process.env.STRIPE_WEBHOOK_SECRET
//                 );

//         } catch (error) {

//             console.error(
//                 "stripe webhook verification failed:",
//                 error.message
//             );

//             return res.status(400).json({
//                 success: false,
//                 message: "webhook signature verification failed"
//             });
//         }


//         // ======================================================
//         // 📩 EVENT RECEIVED
//         // ======================================================

//         console.log(
//             `stripe event received: ${event.type}`
//         );


//         // ======================================================
//         // ✅ CHECKOUT SESSION COMPLETED
//         // ======================================================

//         if (
//             event.type ===
//             "checkout.session.completed"
//         ) {

//             const session =
//                 event.data.object;


//             // ==================================================
//             // 🔍 GET ORDER ID
//             // ==================================================

//             const orderId =
//                 session.metadata?.orderId;


//             if (!orderId) {

//                 console.error(
//                     "order id missing from stripe metadata"
//                 );

//                 return res.status(200).json({
//                     received: true
//                 });
//             }


//             // ==================================================
//             // 🔍 FIND ORDER
//             // ==================================================

//             const order =
//                 await Order.findById(orderId);


//             if (!order) {

//                 console.error(
//                     `order not found: ${orderId}`
//                 );

//                 return res.status(200).json({
//                     received: true
//                 });
//             }


//             // ==================================================
//             // 🛡️ PREVENT DUPLICATE PROCESSING
//             // ==================================================

//             if (
//                 order.payment.status ===
//                 "paid"
//             ) {

//                 console.log(
//                     `order ${orderId} is already paid`
//                 );

//                 return res.status(200).json({
//                     received: true
//                 });
//             }


//             // ==================================================
//             // 💳 UPDATE PAYMENT
//             // ==================================================

//             order.payment.status =
//                 "paid";

//             order.payment.stripeSessionId =
//                 session.id;

//             order.payment.stripePaymentIntentId =
//                 session.payment_intent || null;


//             // ==================================================
//             // 📦 CONFIRM ORDER
//             // ==================================================

//             if (
//                 order.status ===
//                 "pending"
//             ) {

//                 order.status =
//                     "confirmed";
//             }


//             // ==================================================
//             // 💾 SAVE ORDER
//             // ==================================================

//             await order.save();


//             console.log(
//                 `order ${orderId} payment successful`
//             );
//         }


//         // ======================================================
//         // ❌ ASYNC PAYMENT FAILED
//         // ======================================================

//         else if (
//             event.type ===
//             "checkout.session.async_payment_failed"
//         ) {

//             const session =
//                 event.data.object;


//             const orderId =
//                 session.metadata?.orderId;


//             if (!orderId) {

//                 console.error(
//                     "order id missing from stripe metadata"
//                 );

//                 return res.status(200).json({
//                     received: true
//                 });
//             }


//             // ==================================================
//             // 🔍 FIND ORDER
//             // ==================================================

//             const order =
//                 await Order.findById(orderId);


//             if (!order) {

//                 console.error(
//                     `order not found: ${orderId}`
//                 );

//                 return res.status(200).json({
//                     received: true
//                 });
//             }


//             // ==================================================
//             // ❌ UPDATE PAYMENT
//             // ==================================================

//             order.payment.status =
//                 "failed";


//             order.payment.stripeSessionId =
//                 session.id;


//             // ==================================================
//             // 💾 SAVE
//             // ==================================================

//             await order.save();


//             console.log(
//                 `order ${orderId} payment failed`
//             );
//         }


//         // ======================================================
//         // ✅ ASYNC PAYMENT SUCCEEDED
//         // ======================================================

//         else if (
//             event.type ===
//             "checkout.session.async_payment_succeeded"
//         ) {

//             const session =
//                 event.data.object;


//             const orderId =
//                 session.metadata?.orderId;


//             if (!orderId) {

//                 console.error(
//                     "order id missing from stripe metadata"
//                 );

//                 return res.status(200).json({
//                     received: true
//                 });
//             }


//             // ==================================================
//             // 🔍 FIND ORDER
//             // ==================================================

//             const order =
//                 await Order.findById(orderId);


//             if (!order) {

//                 console.error(
//                     `order not found: ${orderId}`
//                 );

//                 return res.status(200).json({
//                     received: true
//                 });
//             }


//             // ==================================================
//             // 💳 UPDATE PAYMENT
//             // ==================================================

//             order.payment.status =
//                 "paid";

//             order.payment.stripeSessionId =
//                 session.id;

//             order.payment.stripePaymentIntentId =
//                 session.payment_intent || null;


//             // ==================================================
//             // 📦 CONFIRM ORDER
//             // ==================================================

//             if (
//                 order.status ===
//                 "pending"
//             ) {

//                 order.status =
//                     "confirmed";
//             }


//             // ==================================================
//             // 💾 SAVE
//             // ==================================================

//             await order.save();


//             console.log(
//                 `order ${orderId} async payment successful`
//             );
//         }


//         // ======================================================
//         // ❌ PAYMENT INTENT FAILED
//         // ======================================================

//         else if (
//             event.type ===
//             "payment_intent.payment_failed"
//         ) {

//             const paymentIntent =
//                 event.data.object;


//             console.log(
//                 `payment failed: ${paymentIntent.id}`
//             );
//         }


//         // ======================================================
//         // 💰 CHARGE REFUNDED
//         // ======================================================

//         else if (
//             event.type ===
//             "charge.refunded"
//         ) {

//             const charge =
//                 event.data.object;


//             console.log(
//                 `refund received: ${charge.id}`
//             );

//             // ==================================================
//             // Add your refund logic here.
//             //
//             // Example:
//             //
//             // order.payment.status = "refunded";
//             //
//             // But your current schema does NOT have
//             // "refunded" in the payment.status enum.
//             // ==================================================
//         }


//         // ======================================================
//         // ℹ️ OTHER EVENTS
//         // ======================================================

//         else {

//             console.log(
//                 `stripe event ignored: ${event.type}`
//             );
//         }


//         // ======================================================
//         // ✅ ACKNOWLEDGE STRIPE
//         // ======================================================

    
//         console.log(
//             "🔥🔥🔥 WEBHOOK WAS PROCESSED 🔥🔥🔥"
//         );
//         return res.status(200).json({
//             received: true
//         });
//     }
// );


// ============================================================
// STRIPE WEBHOOK
// ============================================================

const stripeWebhook = asynchandler(async (req, res) => {

    const startTime = Date.now();
    // Short id to correlate all log lines for this single webhook call
    const reqTag = `[wh-${startTime.toString().slice(-6)}]`;

    const log = (msg) => {
        console.log(`${reqTag} [${new Date().toISOString()}] ${msg}`);
    };

    log("── webhook received ──");

    // ======================================================
    // 🔐 GET STRIPE SIGNATURE
    // ======================================================

    const signature = req.headers["stripe-signature"];

    if (!signature) {
        log("❌ stripe signature missing — rejecting");
        return res.status(400).json({
            success: false,
            message: "stripe signature missing"
        });
    }

    log("signature header present, verifying...");

    // ======================================================
    // 🔐 VERIFY WEBHOOK
    // ======================================================

    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (error) {
        log(`❌ signature verification failed: ${error.message}`);
        return res.status(400).json({
            success: false,
            message: "webhook signature verification failed"
        });
    }

    log(`✅ signature verified — event type: ${event.type} (id: ${event.id})`);

    // ======================================================
    // 🔍 HELPER — find order by metadata.orderId, fallback to session id
    // ======================================================

    const findOrderForSession = async (session) => {

        const orderId = session.metadata?.orderId;

        if (orderId) {
            log(`looking up order by metadata.orderId: ${orderId}`);
            const order = await Order.findById(orderId);
            if (order) {
                log(`order found via metadata.orderId: ${order._id}`);
                return order;
            }
            log(`⚠️ no order found for metadata.orderId: ${orderId}`);
        } else {
            log("⚠️ orderId missing from metadata — trying fallback lookup");
        }

        log(`looking up order by payment.stripeSessionId: ${session.id}`);
        const fallbackOrder = await Order.findOne({
            "payment.stripeSessionId": session.id
        });

        if (fallbackOrder) {
            log(`order found via fallback session id: ${fallbackOrder._id}`);
        } else {
            log(`❌ no order found for session id: ${session.id} — giving up`);
        }

        return fallbackOrder;
    };

    // ======================================================
    // ✅ CHECKOUT SESSION COMPLETED
    // ======================================================

    if (event.type === "checkout.session.completed") {

        log("── handling: checkout.session.completed ──");

        const session = event.data.object;
        const order = await findOrderForSession(session);

        if (!order) {
            log("aborting — order not found. Acking 200 so Stripe does not retry.");
            return res.status(200).json({ received: true });
        }

        if (order.payment.status === "paid") {
            log(`order ${order._id} already marked paid — skipping duplicate update`);
            return res.status(200).json({ received: true });
        }

        log(`order ${order._id} current state — payment.status: ${order.payment.status}, status: ${order.status}`);

        order.payment.status = "paid";
        order.payment.stripeSessionId = session.id;
        order.payment.stripePaymentIntentId = session.payment_intent || null;

        if (order.status === "pending") {
            order.status = "confirmed";
        }

        await order.save();

        log(`✅ order ${order._id} updated — payment.status: paid, status: ${order.status}`);
    }

    // ======================================================
    // ❌ ASYNC PAYMENT FAILED
    // ======================================================

    else if (event.type === "checkout.session.async_payment_failed") {

        log("── handling: checkout.session.async_payment_failed ──");

        const session = event.data.object;
        const order = await findOrderForSession(session);

        if (!order) {
            log("aborting — order not found. Acking 200 so Stripe does not retry.");
            return res.status(200).json({ received: true });
        }

        order.payment.status = "failed";
        order.payment.stripeSessionId = session.id;

        await order.save();

        log(`✅ order ${order._id} updated — payment.status: failed`);
    }

    // ======================================================
    // ✅ ASYNC PAYMENT SUCCEEDED
    // ======================================================

    else if (event.type === "checkout.session.async_payment_succeeded") {

        log("── handling: checkout.session.async_payment_succeeded ──");

        const session = event.data.object;
        const order = await findOrderForSession(session);

        if (!order) {
            log("aborting — order not found. Acking 200 so Stripe does not retry.");
            return res.status(200).json({ received: true });
        }

        if (order.payment.status === "paid") {
            log(`order ${order._id} already marked paid — skipping duplicate update`);
            return res.status(200).json({ received: true });
        }

        order.payment.status = "paid";
        order.payment.stripeSessionId = session.id;
        order.payment.stripePaymentIntentId = session.payment_intent || null;

        if (order.status === "pending") {
            order.status = "confirmed";
        }

        await order.save();

        log(`✅ order ${order._id} updated — payment.status: paid, status: ${order.status} (async)`);
    }

    // ======================================================
    // ❌ PAYMENT INTENT FAILED
    // ======================================================

    else if (event.type === "payment_intent.payment_failed") {

        log("── handling: payment_intent.payment_failed ──");

        const paymentIntent = event.data.object;
        log(`payment_intent failed — id: ${paymentIntent.id}, reason: ${paymentIntent.last_payment_error?.message || "unknown"}`);
    }

    // ======================================================
    // 💰 CHARGE REFUNDED
    // ======================================================

    else if (event.type === "charge.refunded") {

        log("── handling: charge.refunded ──");

        const charge = event.data.object;
        log(`refund event — charge id: ${charge.id}, payment_intent: ${charge.payment_intent}`);

        // Requires "refunded" to be added to payment.status enum in Order schema.
        const order = await Order.findOne({
            "payment.stripePaymentIntentId": charge.payment_intent
        });

        if (order) {
            log(`order found via payment_intent: ${order._id} — current payment.status: ${order.payment.status}`);
            order.payment.status = "refunded";
            await order.save();
            log(`✅ order ${order._id} updated — payment.status: refunded`);
        } else {
            log(`❌ no order found for payment_intent: ${charge.payment_intent}`);
        }
    }

    // ======================================================
    // ℹ️ OTHER EVENTS
    // ======================================================

    else {
        log(`ℹ️ event type not handled — ignoring: ${event.type}`);
    }

    // ======================================================
    // ✅ ACKNOWLEDGE STRIPE
    // ======================================================

    const elapsedMs = Date.now() - startTime;
    log(`── webhook processed in ${elapsedMs}ms — acking 200 ──`);

    return res.status(200).json({ received: true });
});


export {
    createCheckoutSession,
    stripeWebhook
};