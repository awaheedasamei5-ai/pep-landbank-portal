/* Browser-owned worker: push continues through the browser's push service when
   the Palmstead tab is closed. Alert visibility and sound still follow device settings. */
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let message = {};
      try {
        message = event.data ? event.data.json() : {};
      } catch {
        message = { title: "Palmstead reminder", body: event.data?.text() ?? "You have an Operations reminder." };
      }
      const title = typeof message.title === "string" ? message.title : "Palmstead reminder";
      const options = {
        body: typeof message.body === "string" ? message.body : "Open Operations to review your schedule.",
        icon: typeof message.icon === "string" ? message.icon : "/icon-512.png",
        badge: typeof message.badge === "string" ? message.badge : "/favicon-32.png",
        tag: typeof message.tag === "string" ? message.tag : "palmstead-operations-reminder",
        data: { url: typeof message.url === "string" ? message.url : "/dashboard/operations" },
      };
      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url ?? "/dashboard/operations", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(destination);
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(destination);
    })(),
  );
});
