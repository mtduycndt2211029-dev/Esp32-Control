// ===== FIREBASE =====

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"

import {
getDatabase,
ref,
set,
onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js"

import {
getAuth,
signInWithEmailAndPassword,
onAuthStateChanged,
signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"


// ===== FIREBASE CONFIG =====

const firebaseConfig = {
  apiKey: "AIzaSyA_bXUugzjP7uR_CIrhBdpbkZhg5f2Al5o",
  authDomain: "esp32-control-e48e5.firebaseapp.com",
  databaseURL: "https://esp32-control-e48e5-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "esp32-control-e48e5",
  storageBucket: "esp32-control-e48e5.firebasestorage.app",
  messagingSenderId: "269620601839",
  appId: "1:269620601839:web:e61addc83962e09b014c1a"
};


// ===== INIT FIREBASE =====

const app = initializeApp(firebaseConfig)
const db = getDatabase(app)
const auth = getAuth(app)

let scheduleActive = false
let scheduleStart = 0
let scheduleStop = 0


// =====================
// LOGIN UI
// =====================

const authBox = document.getElementById("authBox")
const controlBox = document.getElementById("controlBox")

const loginBtn = document.getElementById("loginBtn")
const logoutBtn = document.getElementById("logoutBtn")

const authMsg = document.getElementById("authMsg")
const badge = document.getElementById("statusBadge")


// =====================
// LOGIN
// =====================

loginBtn.onclick = async ()=>{

authMsg.innerText=""

try{

await signInWithEmailAndPassword(
auth,
document.getElementById("emailField").value,
document.getElementById("passwordField").value
)

}catch(e){

authMsg.innerText = e.message

}

}


// =====================
// LOGOUT
// =====================

logoutBtn.onclick = ()=>{

signOut(auth)

}


// =====================
// AUTH STATE
// =====================

onAuthStateChanged(auth,(user)=>{

if(user){

authBox.style.display="none"
controlBox.style.display="block"

badge.className="status-badge online"
badge.innerText="Online"

}else{

authBox.style.display="block"
controlBox.style.display="none"

badge.className="status-badge offline"
badge.innerText="Offline"

}

})


// ===== UI ELEMENTS =====

const tempValue = document.getElementById("tempValue")
const humValue = document.getElementById("humValue")

const gpio1Btn = document.getElementById("gpio1Btn")
const gpio1Status = document.getElementById("gpio1Status")

const gpio2Btn = document.getElementById("gpio2Btn")
const gpio2Status = document.getElementById("gpio2Status")

const pwmSlider = document.getElementById("pwmSlider")
const pwmValue = document.getElementById("pwmValue")

const startHour = document.getElementById("startHour")
const startMin = document.getElementById("startMin")
const stopHour = document.getElementById("stopHour")
const stopMin = document.getElementById("stopMin")

const applyBtn = document.getElementById("applyBtn")
const cancelBtn = document.getElementById("cancelBtn")

const manualOnBtn = document.getElementById("manualOnBtn")
const manualOffBtn = document.getElementById("manualOffBtn")

const appliedTime = document.getElementById("appliedTime")


// =====================
// SENSOR REALTIME
// =====================

onValue(ref(db,"ESP32/SENSOR"),(snapshot)=>{

const data = snapshot.val()

if(data){

tempValue.innerText = data.temperature + " °C"
humValue.innerText = data.humidity + " %"

}

})


// =====================
// TIME DROPDOWN
// =====================

for(let h=0;h<24;h++){

let opt = new Option(h.toString().padStart(2,"0"),h)

startHour.add(opt.cloneNode(true))
stopHour.add(opt.cloneNode(true))

}

for(let m=0;m<60;m++){

let opt = new Option(m.toString().padStart(2,"0"),m)

startMin.add(opt.cloneNode(true))
stopMin.add(opt.cloneNode(true))

}


// =====================
// PWM CONTROL
// =====================

pwmSlider.addEventListener("input",()=>{

pwmValue.innerText = pwmSlider.value

set(ref(db,"ESP32/GPIO2/pwm"),parseInt(pwmSlider.value))

})


// =====================
// GPIO1 BUTTON
// =====================

gpio1Btn.onclick = ()=>{

const on = gpio1Btn.classList.toggle("on")

const state = on ? "on":"off"

gpio1Status.innerText = "Status: " + state.toUpperCase()

set(ref(db,"ESP32/GPIO1/state"),state)

}


// =====================
// GPIO2 FUNCTION
// =====================

function setGPIO2(on){

const state = on ? "on":"off"

if(on){

gpio2Btn.classList.add("on")
gpio2Status.innerText = "Status: ON"

}else{

gpio2Btn.classList.remove("on")
gpio2Status.innerText = "Status: OFF"

}

set(ref(db,"ESP32/GPIO2/state"),state)

}


// =====================
// SCHEDULE LOGIC
// =====================

function updateSchedule(){

if(!scheduleActive) return

const now = new Date()

const current = now.getHours()*60 + now.getMinutes()

let on = false

if(scheduleStart <= scheduleStop){

on = current >= scheduleStart && current <= scheduleStop

}
else{

on = current >= scheduleStart || current <= scheduleStop

}

setGPIO2(on)

}

setInterval(updateSchedule,1000)


// =====================
// APPLY SCHEDULE
// =====================

applyBtn.onclick = ()=>{

scheduleActive = true

scheduleStart = parseInt(startHour.value)*60 + parseInt(startMin.value)
scheduleStop = parseInt(stopHour.value)*60 + parseInt(stopMin.value)

const sh=startHour.value.padStart(2,"0")
const sm=startMin.value.padStart(2,"0")

const eh=stopHour.value.padStart(2,"0")
const em=stopMin.value.padStart(2,"0")

appliedTime.innerText = `Schedule Applied: ${sh}:${sm} → ${eh}:${em}`
appliedTime.style.display="block"

updateSchedule()

}


// =====================
// CANCEL SCHEDULE
// =====================

cancelBtn.onclick = ()=>{

scheduleActive = false

appliedTime.style.display="none"

setGPIO2(false)

}


// =====================
// MANUAL CONTROL
// =====================

manualOnBtn.onclick = ()=>{

scheduleActive = false

setGPIO2(true)

appliedTime.style.display="none"

}

manualOffBtn.onclick = ()=>{

scheduleActive = false

setGPIO2(false)

appliedTime.style.display="none"

}


// =====================
// REALTIME GPIO1
// =====================

onValue(ref(db,"ESP32/GPIO1/state"),(snapshot)=>{

const state = snapshot.val()

if(state === "on"){

gpio1Btn.classList.add("on")
gpio1Status.innerText = "Status: ON"

}else{

gpio1Btn.classList.remove("on")
gpio1Status.innerText = "Status: OFF"

}

})


// =====================
// REALTIME GPIO2
// =====================

onValue(ref(db,"ESP32/GPIO2/state"),(snapshot)=>{

const state = snapshot.val()

if(state === "on"){

gpio2Btn.classList.add("on")
gpio2Status.innerText = "Status: ON"

}else{

gpio2Btn.classList.remove("on")
gpio2Status.innerText = "Status: OFF"

}

})


// =====================
// REALTIME PWM
// =====================

onValue(ref(db,"ESP32/GPIO2/pwm"),(snapshot)=>{

const val = snapshot.val()

if(val!=null){

pwmSlider.value = val
pwmValue.innerText = val

}

})
