(() => {
  const stored = sessionStorage.getItem("battlebrain.quiz");
  if (!stored) {
    window.location.assign("/dashboard");
    return;
  }

  const quiz = JSON.parse(stored);
  const token = document.querySelector('meta[name="csrf-token"]').content;
  const qText = document.getElementById("q-text");
  const grid = document.getElementById("options-grid");
  const timerEl = document.getElementById("timer");
  const progress = document.getElementById("progress-bar");
  const status = document.getElementById("status");
  const count = document.getElementById("question-count");
  const title = document.getElementById("category-title");

  let index = 0;
  let answered = false;
  let timerId = null;
  let timeLeft = 15;

  title.textContent = quiz.category;
  count.textContent = `${quiz.totalQuestions} questions · 15 seconds each`;

  async function request(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "Request failed.");
    return payload;
  }

  function setButtonsDisabled(disabled) {
    [...grid.children].forEach((button) => {
      button.disabled = disabled;
    });
  }

  function revealAnswer(selectedKey, correctKey, timedOut) {
    [...grid.children].forEach((button) => {
      const key = button.dataset.answer;
      if (key === correctKey) button.classList.add("option-correct");
      if (!timedOut && key === selectedKey && selectedKey !== correctKey) {
        button.classList.add("option-wrong");
      }
    });
  }

  function render() {
    if (index >= quiz.questions.length) return complete();

    const question = quiz.questions[index];
    answered = false;
    timeLeft = 15;
    timerEl.textContent = timeLeft;
    timerEl.classList.remove("timer-warning", "timer-danger");
    progress.style.width = `${(index / quiz.questions.length) * 100}%`;
    qText.textContent = question.question;
    status.textContent = "";
    status.className = "status";
    grid.replaceChildren();

    Object.entries(question.options).forEach(([key, value]) => {
      const button = document.createElement("button");
      button.className = "option";
      button.type = "button";
      button.dataset.answer = key;
      button.setAttribute("aria-label", `Option ${key}: ${value}`);
      button.innerHTML = `<span class="option-key">${key}</span><span class="option-text"></span>`;
      button.querySelector(".option-text").textContent = value;
      button.addEventListener("click", () => submitAnswer(key));
      grid.appendChild(button);
    });

    clearInterval(timerId);
    timerId = setInterval(() => {
      timeLeft -= 1;
      timerEl.textContent = timeLeft;
      if (timeLeft <= 5) timerEl.classList.add("timer-danger");
      else if (timeLeft <= 9) timerEl.classList.add("timer-warning");
      if (timeLeft <= 0) submitAnswer("TIMEOUT", true);
    }, 1000);
  }

  async function submitAnswer(answer, timedOut = false) {
    if (answered) return;
    answered = true;
    clearInterval(timerId);
    setButtonsDisabled(true);

    const question = quiz.questions[index];

    try {
      const payload = await request(`/api/quiz/${quiz.attemptId}/answer`, {
        questionId: question.id,
        answer,
      });

      revealAnswer(answer, payload.result.correctAnswer, timedOut);

      if (timedOut) {
        status.textContent = "Time expired — correct answer revealed.";
        status.classList.add("status-timeout");
      } else if (payload.result.correct) {
        status.textContent = `Correct! +${payload.result.points} pts`;
        status.classList.add("status-correct");
      } else {
        status.textContent = "Incorrect — correct answer is highlighted.";
        status.classList.add("status-wrong");
      }

      index += 1;
      setTimeout(render, 1100);
    } catch (error) {
      status.textContent = error.message;
      status.className = "status status-wrong";
      answered = false;
      setButtonsDisabled(false);
    }
  }

  async function complete() {
    clearInterval(timerId);
    progress.style.width = "100%";

    try {
      const payload = await request(`/api/quiz/${quiz.attemptId}/complete`, {});
      sessionStorage.removeItem("battlebrain.quiz");
      qText.textContent = "Battle complete!";
      count.textContent = `Score: ${payload.result.score} · XP: ${payload.result.xp}`;
      status.textContent = `${payload.result.correctAnswers}/${payload.result.totalQuestions} correct`;
      status.className = "status status-correct";
      grid.replaceChildren();

      const link = document.createElement("a");
      link.className = "btn-primary";
      link.href = "/dashboard";
      link.textContent = "Return to base";
      grid.appendChild(link);
    } catch (error) {
      status.textContent = error.message;
      status.className = "status status-wrong";
    }
  }

  render();
})();
