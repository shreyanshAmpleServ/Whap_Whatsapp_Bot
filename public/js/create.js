async function createFlow() {
  await fetch("/api/flows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name.value,
      trigger: trigger.value,
      startStep: startStep.value,
    }),
  });

  window.location.href = "/flows";
}
