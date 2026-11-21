self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("Unigentamos", {
      body: "You have a workspace update. Open your account to view it.",
      icon: "/unigentamos-logo.svg",
      tag: "workspace-updates",
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/account"));
});
