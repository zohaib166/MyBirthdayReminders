self.addEventListener('push', function (event) {
    const data = event.data.json();
    const options = {
        body: data.body,
        icon: '/icon.png', // Add a small placeholder square image inside /public
        vibrate: [200, 100, 200, 100, 400],
        data: { dateOfArrival: Date.now() },
        actions: [{ action: 'close', title: 'Acknowledge' }]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});