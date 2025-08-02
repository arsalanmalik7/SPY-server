import stripe from '../config/stripe.mjs';
import nodemailer from 'nodemailer';
import { User } from '../schema/userschema.mjs';



const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: process.env.MAILTRAP_USER, // Your Mailtrap username
        pass: process.env.MAILTRAP_PASS, // Your Mailtrap password
    },
});

// Create a payment intent
export const createPaymentIntent = async (req, res) => {
    try {
        const { amount, currency = 'usd', metadata = {} } = req.body;

        // Amount should be in cents (e.g., $10 = 1000)
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency,
            metadata,
        });

        res.status(200).json({
            clientSecret: paymentIntent.client_secret,
        });
    } catch (error) {
        console.error('Stripe error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getPlans = async (req, res) => {
    try {
        const plans = await stripe.prices.list({
            type: "recurring",
            expand: ['data.product'],
        });

        res.status(200).json(plans.data);
    } catch (error) {
        console.error('Stripe error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const createCheckoutSession = async (req, res) => {
    try {
        const { planId, successUrl, cancelUrl, amountDollars, isFreeTrial } = req.body;


        // Convert amount to cents (integer)
        const unitAmount = parseInt(String(amountDollars).replace('.', ''), 10);

        let session;

        if (planId.startsWith("price_")) {

            if (isFreeTrial) {

                session = await stripe.checkout.sessions.create({
                    payment_method_types: ['card'],
                    line_items: [
                        {
                            price: planId,
                            quantity: 1,
                        },
                    ],
                    subscription_data: {
                        trial_period_days: 30,
                    },
                    success_url: successUrl,
                    cancel_url: cancelUrl,
                    mode: "subscription"

                });

            }
            session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price: planId,
                        quantity: 1,
                    },
                ],
                success_url: successUrl,
                cancel_url: cancelUrl,
                mode: 'subscription',
            });
        } else {
            session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            unit_amount: unitAmount,
                            product: planId,
                            recurring: {
                                interval: 'month',
                            },
                        },
                        quantity: 1,
                    },
                ],
                success_url: successUrl,
                cancel_url: cancelUrl,
                mode: 'subscription',
            });
        }
        res.status(200).json(session);
    } catch (error) {
        console.error('Stripe error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getAllTransactions = async (req, res) => {
    try {
        const transactions = await stripe.charges.list({
            limit: 100,
        });

        const emails = transactions.data.map((tr) => tr.billing_details.email);

        const users = await User.find({ email: { $in: emails }, role: { $ne: "super_admin" } }).select('role email current_subscription');
        

        const transactionWithDetails = users.map((user) => {
            const userTransactions = transactions.data.find((tr) => tr?.billing_details?.email === user?.email);
            return {
                ...user._doc,
                ...userTransactions,
            };
        });


        res.status(200).json(transactionWithDetails);
    } catch (error) {
        console.error('Stripe error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const stripeWebhook = async (req, res) => {
    try {
        let event;
        try {
            event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);

        } catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        // Handle the checkout.session.completed event
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const sub = await stripe.subscriptions.retrieve(session.subscription, {
                expand: ['items.data.price.product']
            });
            const item = sub.items.data[0];

            // Retrieve the customer email
            let customerEmail = session.customer_details?.email;
            let customerId = session.customer;
            let subscriptionId = session.subscription;
            let planType = 'single-location'; // Default, you can adjust based on your logic or metadata
            let startDate = new Date(item.current_period_start * 1000);
            let endDate = new Date(item.current_period_end * 1000);
            let paymentMethod = 'card'; // You can fetch more details if needed
            let transactionId = session.id;
            let amount = session.amount_total / 100;
            let currency = session.currency ? session.currency.toUpperCase() : 'USD';

            let locations = Math.floor(amount / 79.99);


            // Optionally, fetch the Stripe subscription for more details
            let stripeSubscription = null;
            if (subscriptionId) {
                const planName = item.price.product.name;
                
                if (planName) planType = planName;

            }

            // If customer email is not in session, fetch from Stripe
            if (!customerEmail && customerId) {
                const customer = await stripe.customers.retrieve(customerId);
                customerEmail = customer.email;
            }

            if (customerEmail) {
                // Update the user in the database
                const updatedUser = await User.findOneAndUpdate(
                    { email: customerEmail },
                    {
                        $set: {
                            'current_subscription.status': true,
                            'current_subscription.plan': planType,
                            'current_subscription.start_date': startDate,
                            'current_subscription.end_date': endDate,
                            'current_subscription.payment_method': paymentMethod,
                            'current_subscription.transaction_id': transactionId,
                            'current_subscription.amount': amount,
                            'current_subscription.locations': locations,
                            'current_subscription.currency': currency,
                        }
                    },
                    { new: true }
                );
                console.log(`Updated subscription for user: ${customerEmail}`);

                // Send subscription update email
                if (updatedUser) {
                    let renewalDate = endDate ? new Date(endDate * 1000).toLocaleDateString() : 'N/A';
                    let receiptInfo = `${amount} ${currency}, ${new Date(startDate * 1000).toLocaleDateString()}`;
                    let paymentFailure = '';
                    if (event.type === 'invoice.payment_failed') {
                        paymentFailure = '<li><b>Payment Failure</b>: We were unable to process your payment. Please update your billing information.</li>';
                    }
                    await transporter.sendMail({
                        from: process.env.SMTP_USER,
                        to: updatedUser.email,
                        subject: 'Speak Your Menu Subscription Update',
                        html: `
                            <div style="font-family:Arial,sans-serif;font-size:15px;">
                                <p>Hi ${updatedUser.first_name} ${updatedUser.last_name},</p>
                                <p>This is a notification regarding your subscription:</p>
                                <ul>
                                    <li><b>Receipt/Invoice</b>: ${receiptInfo}</li>
                                    <li><b>Renewal Reminder</b>: Your subscription will renew on ${renewalDate}.</li>
                                    ${paymentFailure}
                                </ul>
                                <p>For questions or assistance, contact support.</p>
                                <p>Best regards,<br/>The Speak Your Menu Team</p>
                            </div>
                        `
                    });
                }
            } else {
                console.warn('No customer email found for session:', session.id);
            }
        }

        // Return a 200 response to acknowledge receipt of the event
        res.json({ received: true });
    } catch (error) {
        console.error('Stripe error:', error);
        res.status(500).json({ error: error.message });
    }
};