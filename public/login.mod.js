// public/login.mod.js
import {
  auth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword
} from "./firebase-core.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const emailEl = document.getElementById("email");
  const pwEl = document.getElementById("password");
  const rememberEl = document.getElementById("rememberMe");
  const errorEl = document.getElementById("login-error");

  // Restore "Remember me"
  try {
    const savedEmail = localStorage.getItem("savedEmail");
    const rememberMe = localStorage.getItem("rememberMe") === "true";
    if (savedEmail) emailEl.value = savedEmail;
    if (rememberMe) rememberEl.checked = true;
  } catch (_) {}

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";

    try {
      await setPersistence(auth, browserLocalPersistence);
      const email = emailEl.value.trim();
      const password = pwEl.value;

      await signInWithEmailAndPassword(auth, email, password);

      // Persist "Remember me"
      try {
        if (rememberEl.checked) {
          localStorage.setItem("savedEmail", email);
          localStorage.setItem("rememberMe", "true");
        } else {
          localStorage.removeItem("savedEmail");
          localStorage.setItem("rememberMe", "false");
        }
      } catch (_) {}

      // Hand off to existing routing logic
      window.location.href = "/auth-check.html";
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Couldn’t sign in. Check your email or password.";
    }
  });
});
