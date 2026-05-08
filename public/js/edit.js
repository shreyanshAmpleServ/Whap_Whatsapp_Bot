const flowId = window.location.pathname.split("/")[2];

async function loadFlow() {
  const res = await fetch(`/api/flows/${flowId}`);
  const flow = await res.json();

  document.getElementById("flow").innerHTML = `
    <h3>${flow.name}</h3>

    ${flow.steps
      .map(
        (s) => `
      <div style="border:1px solid #ddd;margin:5px;padding:5px">
        ${s.stepKey} (${s.type})<br/>
        ${s.message || ""}
        <br/>
        <button onclick="deleteStep('${s.id}')">❌</button>
      </div>
    `,
      )
      .join("")}
  `;
}

async function addStep() {
  await fetch("/api/steps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      flowId,
      stepKey: stepKey.value,
      type: type.value,
      message: message.value,
      nextStep: nextStep.value,
    }),
  });

  loadFlow();
}

async function deleteStep(id) {
  await fetch(`/api/steps/${id}`, { method: "DELETE" });
  loadFlow();
}

loadFlow();
