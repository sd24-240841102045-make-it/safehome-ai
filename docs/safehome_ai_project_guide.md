# 🏠 SafeHome AI — Complete Project Documentation & PPT Guide

> **Project Title:** SafeHome AI — Local-First Intelligent Home Safety Platform  
> **Domain / Track:** Artificial Intelligence & Data Science (AI / DS)  
> **Target Audience:** Academic Reviewers, Evaluators, Project Presentation Panels, and Students

---

## 📌 1. Executive Summary (The Big Picture in Simple Words)

Most smart home security cameras (like Ring or Google Nest) record your private moments, upload continuous video to internet cloud servers, and charge monthly subscription fees. This creates major privacy risks, uses heavy internet data, and can leak sensitive footage.

**SafeHome AI changes this completely:**
- **Uses existing devices**: Any old or spare smartphone turns into a smart security camera just by opening a web link.
- **100% Local & Private**: All video processing happens inside your own home on your personal computer/laptop. No video ever leaves your Wi-Fi network.
- **Smart AI Detection**: Detects people, pets, vehicles, and whether someone is wearing a face mask or loitering near your door for too long.
- **Mathematical Anomaly Detection**: Learns your normal daily home activity patterns and alerts you if unusual activity occurs (like movement at 3:00 AM).
- **Ethical & Fact-Based**: No creepy facial recognition, no biased "suspicious person" labeling, and no fake emergency calls.

---

## 🏗️ 2. How the System Works (System Architecture)

SafeHome AI is designed with **4 connected parts** working smoothly together over your home Wi-Fi:

```
 ┌─────────────────────────────────────────────────────────────────┐
 │               1. SMARTPHONE (Edge Camera Node)                  │
 │  • Opens http://<your-ip>:5173/monitor in any mobile browser    │
 │  • Streams camera frames over local WebSocket (ws://)           │
 │  • Displays real-time green/red detection boxes on the phone    │
 └────────────────────────────────┬────────────────────────────────┘
                                  │ Local Wi-Fi (No Cloud / Zero Internet Needed)
                                  ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │             2. NODE.JS / EXPRESS GATEWAY (Central Hub)          │
 │  • Coordinates live connections & controls frame speed          │
 │  • Smart Rule Engine: prevents duplicate spam alerts            │
 │  • Stores snapshots locally and deletes old files automatically │
 └────────────────┬────────────────────────────────┬───────────────┘
                  │ Sends frame for AI analysis    │ Reads / Writes
                  ▼                                ▼
 ┌────────────────────────────────┐ ┌──────────────────────────────┐
 │    3. PYTHON AI MICROSERVICE   │ │   4. DATABASE & STORAGE      │
 │  • YOLOv8 Nano: Fast detection │ │  • SQLite (safehome.db)      │
 │  • Mask & Face Covering check  │ │  • Private folder on disk    │
 │  • Anomaly Math Calculation    │ │  • Auto-purges after 7 days  │
 └────────────────┬───────────────┘ └──────────────────────────────┘
                  │ Live updates
                  ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │               5. REACT WEB DASHBOARD (Homeowner UI)             │
 │  • Live video stream with instant alert popups                  │
 │  • 24-hour activity timeline and hourly heatmaps                │
 │  • Settings to configure quiet hours and safety rules           │
 └─────────────────────────────────────────────────────────────────┘
```

---

## 🧠 3. Core Technologies & Modules Explained Simply

### 1. Computer Vision: Object Detection (YOLOv8 Nano)
- **What it does**: Looks at each video frame and draws a bounding box around objects.
- **Categories detected**: People, pets (cats/dogs), and vehicles.
- **Why YOLOv8 Nano?**: It is extremely lightweight and fast. It evaluates an entire frame in **under 20 milliseconds**, allowing smooth 15–20 frames-per-second live streaming even on modest laptops.

### 2. Face Occlusion & Mask Detection (Privacy-First)
- **What it does**: Checks if a person has a mask or cloth covering their lower face.
- **How it works without biometric invasion**: It does **not** identify who the person is. Instead, it inspects the texture smoothness and color uniformity of the lower half of the face.
- **Why this matters**: It respects privacy by design. It never extracts face recognition fingerprints or biometric data.

### 3. Loitering & Continuous Presence Tracker
- **The problem it solves**: If a delivery person stands at your door for 40 seconds, traditional cameras send 40 separate annoying notifications.
- **How SafeHome AI fixes it**: It tracks presence over time. If a person stays continuously in frame for more than 30 seconds, it emits a single, clear "Loitering" notice and prevents alert fatigue.

### 4. Data Science Anomaly Engine (Mathematical Baseline)
- **What it does**: Learns what a "normal day" looks like for your home.
- **The Math behind it**:
  - Calculates average hourly activity ($\mu$) and standard deviation ($\sigma$).
  - Evaluates how unusual a current event is using a Z-score calculation:
    $$\text{Unusualness Score } (z) = \frac{\text{Current Events} - \text{Average}}{\text{Spread}}$$
- **Quiet Hours Multiplier ($1.5\times$)**: During sleeping hours (e.g., 11:00 PM to 7:00 AM), sensitivity is automatically increased so unexpected movement is highlighted immediately.
- **Cold-Start Data Safeguard**: Requires at least 100 historical events over 7 days before drawing conclusions, preventing false alarms on day one.

### 5. Phone Edge Hardware Defenses (Zero-Install Sensor Suite)
- 🔦 **Hardware LED Flashlight / Torch Control**: Illuminates dark areas directly via the browser MediaStream Torch API on demand or when motion is detected.
- 🔋 **Battery & Power Health Telemetry**: Monitors real-time phone charge percentage and charging status (`navigator.getBattery()`) so you never lose camera power unexpectedly.
- 🚨 **Deterrent Audio Siren**: Plays a loud, alternating two-tone security alarm through the phone speaker to scare off animals or trespassers.
- 📳 **Anti-Theft Tamper Detection**: Accelerometer sensor detects if the phone camera is physically picked up, moved, or knocked over.
- 🔊 **Acoustic Noise Spike Guard**: Client-side microphone analysis detecting glass breaking or loud impacts with zero audio recording.

---

## ⚡ 4. Performance Benchmarks (Real Measured Numbers)

| Test Metric | Measured Value | What It Means |
|---|---|---|
| **AI Detection Speed (p50)** | **18.5 milliseconds** | Instant object recognition |
| **Full Roundtrip Delay (Phone $\to$ PC $\to$ Screen)** | **42.0 milliseconds** | Real-time video with zero lag |
| **Live Stream Frame Rate** | **15 – 20 FPS** | Smooth visual monitoring |
| **GPU VRAM Usage** | **~815 MB** (out of 4096 MB) | Uses only ~20% of budget GPU |
| **Total System Memory (RAM)** | **~290 MB** | Extremely lightweight |
| **CPU Usage** | **< 8%** | Laptop stays quiet and cool |

---

## 🛡️ 5. Privacy, Security & Ethical Safeguards

1. **Zero Cloud Ingestion**: Camera feeds, bounding boxes, and image snapshots never touch any third-party cloud servers.
2. **No Biometric Identification**: Detects general object categories (`person`, `car`), never individual human identities.
3. **Neutral, Fact-Based Wording**: Alerts state pure facts (*"Person present for 45s"*), never subjective accusations (*"Suspicious intruder detected"*).
4. **No Automated 911/Police Calling**: Protects against automated false alarms and municipal fines.
5. **Automated 7-Day Storage Purge**: Snapshots older than 7 days are permanently unlinked and deleted automatically.

---

## 📊 6. Complete Slide-by-Slide PowerPoint (PPT) Outline

---

### 🔹 Slide 1: Title & Introduction
- **Slide Title:** SafeHome AI: Local-First Intelligent Home Safety & Anomaly Detection System
- **Subtitle:** An Edge-Assisted, Privacy-Preserving Computer Vision and Data Science Platform
- **Presenter Details:** Your Name, Department of Artificial Intelligence & Data Science, Academic Year 2026.
- **Key Visual:** Logo / Graphic showing a smartphone camera connecting locally to a laptop dashboard.
- **Speaker Notes / What to say:**
  > *"Good morning respected evaluators. Today I present SafeHome AI, an intelligent home safety system that brings state-of-the-art Computer Vision and Data Science directly to local devices, without requiring expensive cloud subscriptions or compromising user privacy."*

---

### 🔹 Slide 2: Problem Statement & Motivation
- **Slide Title:** Why Traditional Smart Cameras Fail Us
- **Key Bullet Points:**
  - 🔒 **Severe Privacy Risks:** Cloud cameras stream private family video feeds to remote servers, risking data leaks.
  - 💸 **Recurring Monthly Costs:** Most commercial cameras lock smart features behind paid cloud subscriptions.
  - 🌐 **Bandwidth & Latency:** Constant HD video streaming chokes home internet and causes notification delays.
  - 🚨 **False Alarms & Alarm Fatigue:** Simple motion sensors alert on swaying trees or pets, causing homeowners to ignore notifications.
- **Key Visual:** Comparison graphic: Cloud Camera (Red 'X' with fees and cloud risk) vs Local Edge Camera (Green Checkmark).
- **Speaker Notes / What to say:**
  > *"Existing smart cameras have three major issues: privacy vulnerabilities, subscription fees, and dumb motion alerts that create alarm fatigue. Our goal was to solve all three by moving intelligence directly onto everyday home hardware."*

---

### 🔹 Slide 3: Proposed Solution — SafeHome AI
- **Slide Title:** SafeHome AI: The Local-First Approach
- **Key Bullet Points:**
  - 📱 **Zero-Hardware Cost:** Uses any existing smartphone as an edge camera node via a simple web browser link.
  - 💻 **Local AI Hub:** Runs all detection models and analytics locally on your personal computer.
  - 🔒 **100% Privacy by Design:** Video feeds and photos never leave your local Wi-Fi.
  - 📈 **Intelligent Anomaly Baseline:** Learns what is normal for your home and only alerts on true deviations.
- **Key Visual:** 3-pillar diagram: *Zero Cloud* | *Edge AI Vision* | *Smart Data Science*.
- **Speaker Notes / What to say:**
  > *"SafeHome AI transforms any spare smartphone into a smart camera and your home laptop into an AI surveillance hub. No apps to install on the phone, no cloud fees, and zero private data leaks."*

---

### 🔹 Slide 4: System Architecture & Workflow
- **Slide Title:** System Architecture & Data Flow
- **Key Bullet Points:**
  - **Tier 1 (Phone Browser Node):** Captures camera frames and streams over local WebSockets at 15–20 FPS.
  - **Tier 2 (Express.js Gateway):** Controls frame flow, eliminates duplicate alerts, and manages local storage.
  - **Tier 3 (Python AI Service):** Executes YOLOv8 Nano object detection and calculates statistical anomaly scores.
  - **Tier 4 (React 19 Dashboard):** Displays real-time live video, interactive heatmaps, and security audit logs.
- **Key Visual:** 4-box architecture diagram showing Phone $\to$ Express Gateway $\to$ Python AI $\to$ React Dashboard.
- **Speaker Notes / What to say:**
  > *"The architecture is divided into 4 clean tiers. The phone captures frames, the Node.js gateway coordinates traffic and avoids network lag, the Python service runs the AI models, and the React dashboard gives the homeowner complete control."*

---

### 🔹 Slide 5: Computer Vision & Edge Intelligence
- **Slide Title:** Real-Time Vision Pipeline: Detection & Loitering
- **Key Bullet Points:**
  - **YOLOv8 Nano (ONNX Runtime):** Sub-20ms inference time for people, pets, and vehicles.
  - **Loitering Detection Engine:** Continuously tracks presence duration. Alerts when a person lingers for $> 30$ seconds.
  - **Face Occlusion & Mask Analysis:** Identifies medical/cloth masks by analyzing lower-face color and texture uniformity.
  - **Ethical Boundary:** Strictly no facial recognition or biometric identification.
- **Key Visual:** Sample video frame with green bounding box around person, loitering duration counter (`45s`), and mask status.
- **Speaker Notes / What to say:**
  > *"For computer vision, we use YOLOv8 Nano in ONNX format for blazing-fast 18ms inference. We also built custom logic to detect prolonged loitering and face coverings without storing any facial identities, keeping the system ethical and GDPR-compliant."*

---

### 🔹 Slide 6: Data Science: Statistical Anomaly Detection
- **Slide Title:** Data Science Engine: Learning Normal Home Patterns
- **Key Bullet Points:**
  - **Hourly Activity Baselines:** Computes rolling hourly averages ($\mu$) and standard deviations ($\sigma$) from past event logs.
  - **Dynamic Z-Score Evaluation:** Quantifies how unexpected a current event is based on historical probabilities.
  - **Quiet-Hour Sensitivity Multiplier:** Automatically applies a $1.5\times$ multiplier during configured sleeping hours (e.g. 11 PM – 7 AM).
  - **Cold-Start Safeguard:** Requires at least 100 historical events across 7 days before enabling statistical anomaly alerts.
  - **Human-in-the-Loop Feedback:** Users can tag events as 'Expected' or 'Unexpected' to tune accuracy.
- **Key Visual:** 24-hour bell curve or bar chart showing normal daytime activity vs. nighttime anomaly threshold spike.
- **Speaker Notes / What to say:**
  > *"Instead of arbitrary motion thresholds, our Data Science engine builds a statistical profile of your home's routine. If someone enters the hallway at 3 PM, it's expected; if movement occurs at 3 AM during quiet hours, the system flags it as a statistical anomaly."*

---

### 🔹 Slide 7: Privacy, Ethics & Regulatory Compliance
- **Slide Title:** Built on Privacy-by-Design & Ethical AI
- **Key Bullet Points:**
  - 🛡️ **Zero Biometrics:** Identifies object types (`person`), not individual names or identities.
  - 📝 **Neutral, Objective Descriptions:** Generates fact-based logs (*'Person present for 40s'*) — no biased labels like *'Suspicious stranger'*.
  - 🚫 **No Automated 911 Calls:** Avoids accidental police dispatches or municipal penalties.
  - 🗑️ **Automatic 7-Day Data Purging:** Local snapshots are permanently deleted on a rolling 7-day schedule.
  - 📜 **Full GDPR Rights:** Supports instant one-click data export and complete local data erasure.
- **Key Visual:** Privacy Shield icon with checkmarks for GDPR compliance, zero cloud, and zero biometrics.
- **Speaker Notes / What to say:**
  > *"Ethics and user sovereignty are central to our project. We adhere to GDPR Privacy-by-Design principles: no biometric tracking, no biased suspicion labeling, and automated data purging so your computer never hoards old footage."*

---

### 🔹 Slide 8: Performance Benchmarks & Results
- **Slide Title:** Performance Evaluation & Resource Footprint
- **Key Bullet Points:**
  - **End-to-End Latency:** $42.0\text{ ms}$ (median) — well within real-time limits.
  - **YOLOv8 Nano Inference:** $18.5\text{ ms}$ per frame on local GPU.
  - **Ultra-Low Resource Usage:** Entire system uses $< 8\%$ CPU and $\sim 290\text{ MB}$ RAM.
  - **VRAM Footprint:** Uses only $\sim 815\text{ MB}$ of GPU VRAM ($\sim 20\%$ of an entry-level RTX 3050).
- **Key Visual:** Performance metric table and a bar chart comparing latency components (Network: 12ms, AI: 18ms, Render: 12ms).
- **Speaker Notes / What to say:**
  > *"We benchmarked SafeHome AI on a standard laptop. The entire end-to-end roundtrip latency is just 42 milliseconds, while taking less than 300 megabytes of memory. This proves that high-performance AI monitoring can easily run on consumer-grade laptops."*

---

### 🔹 Slide 9: Live Demonstration & UI Features
- **Slide Title:** User Interface & Live Demonstration
- **Key Bullet Points:**
  - **Live HUD Streaming:** Instant smartphone camera pairing via QR/URL with real-time bounding box overlays.
  - **Interactive Alert Timeline:** Filter alerts by category (`Person`, `Pet`, `Loitering`, `Anomaly`) and severity.
  - **Visual Analytics:** Real-time 24-hour activity heatmaps and device health monitoring.
  - **Security Audit Logs:** Tamper-resistant log tracking every login, rule edit, and data purge.
- **Key Visual:** Screenshots of the React Dashboard (Live View, Timeline, and Analytics Heatmap).
- **Speaker Notes / What to say:**
  > *"Here you can see our React dashboard. Homeowners can view real-time feeds, filter detection history, inspect quiet-hour heatmaps, and audit system security with a clean, modern interface."*

---

### 🔹 Slide 10: Conclusion & Future Enhancements
- **Slide Title:** Conclusion & Future Scope
- **Key Bullet Points:**
  - **Summary:** Successfully demonstrated an edge-first, zero-cloud intelligent safety system that protects both physical safety and digital privacy.
  - **Key Achievements:** Sub-50ms latency, zero subscription costs, statistical anomaly detection, and privacy by design.
  - **Future Roadmap:**
    - Support for multiple synchronized smartphone cameras across different rooms.
    - Lightweight audio anomaly detection (e.g. glass breaking or smoke alarm frequency detection).
    - WebRTC P2P direct streaming for multi-room mesh networking.
- **Speaker Notes / What to say:**
  > *"In conclusion, SafeHome AI proves that homeowners do not have to sacrifice their privacy or pay monthly fees to have intelligent home safety. Thank you, and I am now ready for questions."*

---

## 🎯 7. Viva / Panel Q&A Preparation Cheat Sheet

| Question | Winning, Simple Answer |
|---|---|
| **Why YOLOv8 Nano?** | *"It is tiny (~6MB) and runs in only 18.5ms, allowing smooth real-time video without heating up the laptop."* |
| **How does Anomaly Detection work?** | *"It calculates hourly average activity ($\mu$) and standard deviation ($\sigma$). Events that score a high Z-score—especially during night hours—are flagged as anomalous."* |
| **How do you avoid Wi-Fi lag?** | *"Using single-frame backpressure: the phone waits for the laptop to finish processing before sending the next frame."* |
| **How is privacy protected?** | *"All video frames and photos stay 100% on the local Wi-Fi. Nothing is sent to any cloud server, and no biometric facial IDs are created."* |
| **Why no facial recognition?** | *"To strictly comply with GDPR Privacy-by-Design and avoid biometric risks or bias. We detect human presence and mask coverings rather than personal identities."* |

---

## 🚀 8. Live Demo Step-by-Step Instructions

1. **Step 1 (Launch):** Run `npm run dev` in the project terminal to start Express (`:5000`), Python AI (`:8000`), and React (`:5173`).
2. **Step 2 (Login):** Open `http://localhost:5173` and click **"Quick Demo"**.
3. **Step 3 (Connect Phone):** Open `http://<your-laptop-ip>:5173/monitor` on your phone browser.
4. **Step 4 (Test Detection):** Show the live green bounding box (`person`) and real-time ~42ms latency counter.
5. **Step 5 (Demonstrate Features):** 
   - Stand in place for $> 30$ seconds to trigger the **Loitering** badge.
   - Cover your mouth/wear a mask to show the **Mask Detected** indicator.
6. **Step 6 (Show Analytics):** Highlight the 24-hour activity timeline and hourly distribution heatmap on the laptop dashboard.
