async function loadFlows() {
  const res = await fetch("/api/flows");
  const flows = await res.json();

  const container = document.getElementById("flows");

  container.innerHTML = flows
    .map(
      (f) => `
    <div style="border:1px solid #ccc;margin:10px;padding:10px">
      <b>${f.name}</b><br/>
      Trigger: ${f.trigger}<br/>
      Start: ${f.startStep}<br/>

      <button onclick="location.href='/flows/${f.id}'">Edit</button>
    </div>
  `,
    )
    .join("");
}

loadFlows();
