document.addEventListener('DOMContentLoaded', () => {
  
  const auth = firebase.auth();

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    try {
      await auth.signInWithEmailAndPassword(email, password);
      console.log("Login success");
      window.location.href = 'tally.html';
    } catch (err) {
      console.error("Login error:", err);
      alert("Login failed: " + err.message);
    }
  });
});
