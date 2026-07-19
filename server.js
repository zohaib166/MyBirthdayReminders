const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');
const cron = require('node-cron');
require('dotenv').config();
global.WebSocket = require('ws');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Generate VAPID keys once for Web Push (Agent will automate this)
webpush.setVapidDetails(
    'mailto:zohaib166@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

app.get('/api/vapid-key', (req, res) => res.json({ publicKey: process.env.VAPID_PUBLIC_KEY }));

// Route: Save Manual Birthday
app.post('/api/birthdays', async (req, res) => {
    const { name, birthDate } = req.body;
    const [year, month, day] = birthDate.split('-');

    const { error } = await supabase.from('birthdays').insert([
        { name, birth_month: parseInt(month), birth_day: parseInt(day), full_date: birthDate }
    ]);
    if (error) return res.status(500).json({ error: error.message });
    res.sendStatus(200);
});

// Route: Get All Birthdays
app.get('/api/birthdays', async (req, res) => {
    const { data, error } = await supabase.from('birthdays').select('*').order('birth_month').order('birth_day');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Route: Update Birthday
app.put('/api/birthdays/:id', async (req, res) => {
    const { id } = req.params;
    const { name, birthDate } = req.body;
    const [year, month, day] = birthDate.split('-');
    const { error } = await supabase.from('birthdays').update({
        name, birth_month: parseInt(month), birth_day: parseInt(day), full_date: birthDate
    }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.sendStatus(200);
});

// Route: Delete Birthday
app.delete('/api/birthdays/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('birthdays').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.sendStatus(200);
});

// Route: Save Settings
app.post('/api/settings', async (req, res) => {
    const { daysBefore, remindTime } = req.body;
    const { error } = await supabase.from('settings').upsert({ id: 1, days_before: daysBefore, remind_time: remindTime });
    if (error) return res.status(500).json({ error: error.message });
    res.sendStatus(200);
});

// Route: Save Phone Push Subscription
app.post('/api/subscribe', async (req, res) => {
    const { subscription } = req.body;
    await supabase.from('push_subscriptions').upsert({ endpoint: subscription.endpoint, keys: subscription.keys }, { onConflict: 'endpoint' });
    res.sendStatus(201);
});

// Cron Job: Runs every minute to check for matching birthdays and fire alerts
/*cron.schedule('* * * * *', async () => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Get user settings
    const { data: settings } = await supabase.from('settings').select('*').single();
    if (!settings) return;

    // 💥 THE FIX: Strip the seconds (:00) off the database string (e.g., "23:20:00" -> "23:20")
    const formattedDbTime = settings.remind_time.slice(0, 5);

    // Terminal heartbeat log so you can see exactly what the server is doing
    console.log(`[Cron Heartbeat] Server Time: ${currentTime} | Target DB Time: ${formattedDbTime}`);

    // Compare clean HH:MM strings
    if (formattedDbTime !== currentTime) return;

    console.log("⏰ Time matches! Checking database for upcoming birthdays...");

    // Calculate target date based on "same day" or "1 day before" preference
    let targetDate = new Date();
    if (settings.days_before === 1) targetDate.setDate(targetDate.getDate() + 1);

    const targetMonth = targetDate.getMonth() + 1;
    const targetDay = targetDate.getDate();

    // Fetch matches
    const { data: matchingBirthdays } = await supabase.from('birthdays')
        .select('name').eq('birth_month', targetMonth).eq('birth_day', targetDay);

    if (matchingBirthdays && matchingBirthdays.length > 0) {
        console.log(`🎉 Found ${matchingBirthdays.length} matching birthday(s). Dispatching alarms...`);
        const { data: subs } = await supabase.from('push_subscriptions').select('*');

        matchingBirthdays.forEach(bday => {
            const payload = JSON.stringify({ title: '🎉 Birthday Reminder Alert!', body: `It is ${bday.name}'s birthday soon!` });
            subs.forEach(sub => {
                webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload)
                    .then(() => console.log(`✅ Push successfully delivered for ${bday.name}`))
                    .catch(err => console.error('❌ Push delivery failed:', err));
            });
        });
    } else {
        console.log("🤷 No matching birthdays found for this date layout.");
    }
});*/

// 💥 NEW: Convert the cron block into a clear, callable Serverless API Route
app.get('/api/cron-check', async (req, res) => {
    try {
        const now = new Date();

        // Convert server time to your specific local time zone (e.g., Asia/Kolkata)
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Kolkata', // <-- Ensure this matches your location!
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        const [hour, minute] = formatter.format(now).split(':');
        const currentTime = `${hour}:${minute}`;

        // 1. Fetch user preference settings from Supabase
        const { data: settings } = await supabase.from('settings').select('*').single();
        if (!settings) return res.status(200).send("No settings configured yet.");

        const formattedDbTime = settings.remind_time.slice(0, 5);

        // 2. Check if the current time matches your preferred notification window
        if (formattedDbTime !== currentTime) {
            return res.status(200).send(`Time mismatch. Checking for ${formattedDbTime}, current local time is ${currentTime}`);
        }

        // 3. Time matches! Calculate targets
        let targetDate = new Date();
        if (settings.days_before === 1) targetDate.setDate(targetDate.getDate() + 1);

        const targetMonth = targetDate.getMonth() + 1;
        const targetDay = targetDate.getDate();

        // 4. Query matching birthdays
        const { data: matchingBirthdays } = await supabase.from('birthdays')
            .select('name').eq('birth_month', targetMonth).eq('birth_day', targetDay);

        if (matchingBirthdays && matchingBirthdays.length > 0) {
            const { data: subs } = await supabase.from('push_subscriptions').select('*');

            for (const bday of matchingBirthdays) {
                const payload = JSON.stringify({
                    title: '🎉 Birthday Reminder Alert!',
                    body: `It is ${bday.name}'s birthday soon!`
                });

                for (const sub of subs) {
                    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload).catch(e => console.error(e));
                }
            }
            return res.status(200).send(`Successfully processed and dispatched alarms for ${matchingBirthdays.length} matches.`);
        }

        res.status(200).send("Time matches, but no birthdays found for this target window.");
    } catch (error) {
        console.error("Serverless Cron error:", error);
        res.status(500).send(error.message);
    }
});

// 💥 REMOVE: app.listen(3000, ...)
// 💥 ADD THIS: Export the app module so Vercel can handle the routing wrappers
module.exports = app;

// Secret route to test notifications instantly
app.get('/api/test-push', async (req, res) => {
    try {
        const { data: subs, error } = await supabase.from('push_subscriptions').select('*');
        if (error || !subs || subs.length === 0) return res.status(404).send('No device subscriptions found.');

        const payload = JSON.stringify({
            title: '🚨 Test Successful!',
            body: 'Your background push notification server is fully alive!'
        });

        // Fire to all registered devices
        for (const sub of subs) {
            await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
        }

        res.send('Push sent successfully to all registered devices!');
    } catch (err) {
        console.error('Error firing test push:', err);
        res.status(500).json({ error: err.message });
    }
});

//app.listen(3000, () => console.log('Server running on port 3000'));