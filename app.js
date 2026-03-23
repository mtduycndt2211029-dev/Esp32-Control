const $ = id => document.getElementById(id);

// Firebase imports (unchanged)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, push, remove, onValue, runTransaction } 
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } 
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = { apiKey: "AIzaSyA_bXUugzjP7uR_CIrhBdpbkZhg5f2Al5o", authDomain: "esp32-control-e48e5.firebaseapp.com", databaseURL: "https://esp32-control-e48e5-default-rtdb.asia-southeast1.firebasedatabase.app" };
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// LOGIN HANDLERS
$("loginBtn").onclick = async () => {
  $("loginError").innerText = "";
  try {
    await signInWithEmailAndPassword(auth, $("emailField").value, $("passwordField").value);
  } catch(e) {
    $("loginError").innerText = e.message;
  }
};
$("logoutBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth, user => {
  $("authBox").style.display = user ? "none" : "flex";
  $("app").style.display = user ? "block" : "none";
});

// NAVIGATION
function show(page) {
  ["dash","chartPage","historyPage"].forEach(id => $(id).style.display = "none");
  page.style.display = "block";
}
$("navDash").onclick = () => show($("dash"));
$("navChart").onclick = () => show($("chartPage"));
$("navHistory").onclick = () => show($("historyPage"));

// CHART SETUP
const ctx = $("chart").getContext("2d");
let tArr = [], hArr = [], timeArr = [];
const chart = new Chart(ctx, {
  type: "line",
  data: {
    labels: timeArr,
    datasets: [
      { label: "Temperature", data: tArr, borderColor: "red", fill: false },
      { label: "Humidity",    data: hArr, borderColor: "blue", fill: false }
    ]
  },
  options: { responsive: true }
});

// LOG FUNCTION (push new log entry)
function log(event, value, pwm=null) {
  const entry = { event, value, pwm, user: auth.currentUser?.email, timestamp: Date.now() };
  push(ref(db, "ESP32_LOGS"), entry);
}

// HISTORY TABLE (read from DB)
let lastLogs = null;
function updateHistory(data) {
  const table = $("table");
  table.innerHTML = "";
  if(!data) return;
  // Sort by timestamp descending
  const rows = Object.values(data).sort((a,b) => b.timestamp - a.timestamp);
  rows.forEach(r => {
    const tr = table.insertRow();
    tr.insertCell().innerText = new Date(r.timestamp).toLocaleString();
    tr.insertCell().innerText = r.event;
    tr.insertCell().innerText = r.user;
    const valCell = tr.insertCell();
    valCell.innerText = r.value + (r.pwm!==undefined ? ` (PWM:${r.pwm})` : "");
  });
}
onValue(ref(db, "ESP32_LOGS"), snap => {
  const data = snap.val();
  if(JSON.stringify(data) !== lastLogs) {
    lastLogs = JSON.stringify(data);
    updateHistory(data);
  }
});

// FILTER FUNCTIONALITY
$("filter").onclick = () => {
  const userF = $("fu").value.toLowerCase();
  const eventF = $("fe").value.toLowerCase();
  [...$("table").rows].forEach(row => {
    const matchEvent = row.cells[1].innerText.toLowerCase().includes(eventF);
    const matchUser  = row.cells[2].innerText.toLowerCase().includes(userF);
    row.style.display = (matchEvent && matchUser) ? "" : "none";
  });
};

// EXPORT TO EXCEL
$("export").onclick = () => {
  const visibleRows = [...$("table").rows].filter(r => r.style.display !== "none");
  if(visibleRows.length === 0) {
    alert("No data to export");
    return;
  }
  const rows = visibleRows.map(r => ({
    Time:  r.cells[0].innerText,
    Event: r.cells[1].innerText,
    User:  r.cells[2].innerText,
    Value: r.cells[3].innerText
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Logs");
  XLSX.writeFile(wb, "logs.xlsx");
};

// CLEAR HISTORY
$("clearHistory").onclick = () => {
  if(confirm("Clear all logs?")) remove(ref(db,"ESP32_LOGS"));
};

// SENSOR DATA (temperature & humidity)
onValue(ref(db, "ESP32/SENSOR"), snap => {
  const d = snap.val();
  if(!d) return;
  $("temp").innerText = d.temperature + "°C";
  $("hum").innerText  = d.humidity + "%";
  tArr.push(d.temperature);
  hArr.push(d.humidity);
  timeArr.push(new Date().toLocaleTimeString());
  if(tArr.length > 20) { tArr.shift(); hArr.shift(); timeArr.shift(); }
  chart.update();
});

// TWO-WAY LISTENERS FOR GPIO STATES
onValue(ref(db, "ESP32/GPIO1/state"), snap => {
  if(snap.exists()) {
    $("bulb").className = "bulb " + (snap.val()==="on" ? "on" : "off");
  }
});
onValue(ref(db, "ESP32/GPIO2/state"), snap => {
  if(snap.exists()) {
    const on = (snap.val() === "on");
    g2State = on;
    $("gpio2Lamp").className = on ? "bulb on" : "bulb off";
    // Adjust opacity per PWM if lamp is on
    const pwmVal = parseInt($("pwmSlider").value);
    $("gpio2Lamp").style.opacity = on ? (pwmVal/255) : 0.2;
  }
});
onValue(ref(db, "ESP32/GPIO2/pwm"), snap => {
  if(snap.exists()) {
    const pwm = snap.val();
    $("pwmSlider").value = pwm;
    $("pwmValue").innerText = pwm;
    if(g2State) {
      $("gpio2Lamp").style.opacity = pwm/255;
    }
  }
});

// GPIO1 CONTROL (no change needed aside from listener above)
$("g1On").onclick = () => {
  set(ref(db, "ESP32/GPIO1/state"), "on");
  $("bulb").className = "bulb on";
  log("GPIO1","ON");
};
$("g1Off").onclick = () => {
  set(ref(db, "ESP32/GPIO1/state"), "off");
  $("bulb").className = "bulb off";
  log("GPIO1","OFF");
};

// GPIO2 + PWM + SCHEDULE
let g2State = false;  // current on/off state
let mode = "manual";
let start = 0, stop = 0;
let lastScheduleState = null;

// MODE SWITCH
$("manualMode").onclick = () => {
  mode = "manual";
  $("manualBox").style.display = "block";
  $("scheduleBox").style.display = "none";
};
$("scheduleMode").onclick = () => {
  mode = "schedule";
  $("manualBox").style.display = "none";
  $("scheduleBox").style.display = "block";
};

// TIME SELECTORS POPULATION
for(let i=0; i<24; i++) {
  $("sh").add(new Option(String(i).padStart(2,'0'), i));
  $("eh").add(new Option(String(i).padStart(2,'0'), i));
}
for(let i=0; i<60; i++) {
  $("sm").add(new Option(String(i).padStart(2,'0'), i));
  $("em").add(new Option(String(i).padStart(2,'0'), i));
}
$("g2On").onclick = () => {
  mode = "manual";
  setG2(true);
};

$("g2Off").onclick = () => {
  mode = "manual";
  setG2(false);
};
// APPLY SCHEDULE
$("apply").onclick = () => {
  start = parseInt($("sh").value)*60 + parseInt($("sm").value);
  stop  = parseInt($("eh").value)*60 + parseInt($("em").value);
  const shVal = String($("sh").value).padStart(2,'0');
  const smVal = String($("sm").value).padStart(2,'0');
  const ehVal = String($("eh").value).padStart(2,'0');
  const emVal = String($("em").value).padStart(2,'0');
  $("scheduleStatus").innerText = `Start: ${shVal}:${smVal}  Stop: ${ehVal}:${emVal}`;
  mode = "schedule";
  // Check current time relative to schedule
  const nowMins = new Date().getHours()*60 + new Date().getMinutes();
  if(start <= stop) {
    g2State = (nowMins >= start && nowMins < stop);
  } else {
    g2State = (nowMins >= start || nowMins < stop);
  }
  set(ref(db,"ESP32/SCHEDULE"),{
  active: true,
  start: start,
  stop: stop
})
  setG2(g2State);
  log("SCHEDULE", `${shVal}:${smVal}→${ehVal}:${emVal}`, $("pwmSlider").value);
};

// CANCEL SCHEDULE
$("cancel").onclick = () => {
  mode = "manual";
  $("scheduleStatus").innerText = "";
  setG2(false);
  log("SCHEDULE","CANCEL");
  set(ref(db,"ESP32/SCHEDULE/active"),false)
};

// SCHEDULE INTERVAL LOOP
setInterval(() => {
  if(mode !== "schedule") return;
  const now = new Date();
  const cur = now.getHours()*60 + now.getMinutes();
  let on = false;
  if(start <= stop) {
    on = (cur >= start && cur < stop);
  } else {
    on = (cur >= start || cur < stop);
  }
  if(on !== lastScheduleState) {
    lastScheduleState = on;
    setG2(on);
  }
}, 1000);

// SET GPIO2 FUNCTION WITH GUARD
function setG2(on) {
  const pwm = parseInt($("pwmSlider").value);

  g2State = on;

  $("gpio2Lamp").className = on ? "bulb on" : "bulb off";
  $("gpio2Lamp").style.opacity = on ? (pwm/255) : 0.2;

  set(ref(db, "ESP32/GPIO2/state"), on ? "on" : "off");
  set(ref(db, "ESP32/GPIO2/pwm"), pwm);

  log("GPIO2", on ? "ON" : "OFF", pwm);
}

// PWM SLIDER (debounced)
let pwmTimeout = null;
$("pwmSlider").oninput = () => {
  const val = $("pwmSlider").value;
  $("pwmValue").innerText = val;
  if(g2State) {
    clearTimeout(pwmTimeout);
    pwmTimeout = setTimeout(() => {
      setG2(true);
    }, 100);
  }
};
