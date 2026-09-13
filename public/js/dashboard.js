(() => {
  const token = document.querySelector('meta[name="csrf-token"]').content;
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const response = await fetch("/api/quiz/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": token,
          },
          body: JSON.stringify({ category: button.dataset.category }),
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.message || "Unable to start quiz.");
        sessionStorage.setItem(
          "battlebrain.quiz",
          JSON.stringify(payload.quiz),
        );
        window.location.assign("/game");
      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    });
  });
})();
