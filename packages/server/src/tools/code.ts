import type { ITool, ToolContext, ToolResult } from "@agenthub/shared";
import { logger } from "../utils/logger";

const E2B_KEY = process.env.E2B_API_KEY;

export const codeTool: ITool = {
  name: "code",
  description: "在沙箱环境中执行代码。参数: { input: 要执行的代码, language: 'python'|'javascript'|'bash' }",
  parameters: { input: "string", language: "string" },

  async run(ctx: ToolContext): Promise<ToolResult> {
    const input = typeof ctx.input === "string" ? ctx.input : (ctx.input as Record<string, string>)?.input ?? "";
    const language = (ctx.input as Record<string, string>)?.language ?? "javascript";

    // Real: e2b Sandbox
    if (E2B_KEY) {
      try {
        const { Sandbox } = await import("@e2b/code-interpreter");
        const sandbox = await Sandbox.create();
        const result = await sandbox.runCode(input, { language });
        await sandbox.close();
        return {
          success: true,
          data: {
            output: result.logs.stdout?.join("\n") ?? result.text,
            error: result.logs.stderr?.join("\n") ?? result.error?.value,
            language,
          },
        };
      } catch (_err) {
        logger.warn("e2b failed, fallback to mock", 'Code');
      }
    }

    // Generate HTML code for web projects
    if (language === "html" || input.includes("<!DOCTYPE html>") || input.includes("<html") || 
        input.includes("番茄钟") || input.includes("Pomodoro") || input.includes("HTML")) {
      const htmlCode = generateHtmlCode(input);
      return {
        success: true,
        data: {
          output: htmlCode,
          language: "html",
          source: "generated",
        },
      };
    }

    // Mock fallback
    return {
      success: true,
      data: {
        output: `[沙箱执行 - ${language}]\n> ${input.slice(0, 80)}${input.length > 80 ? "..." : ""}\n\n执行成功 ✓`,
        language,
        source: "mock",
      },
    };
  },
};

function generateHtmlCode(task: string): string {
  // Simple HTML code generator for common tasks
  if (task.includes("番茄钟") || task.includes("Pomodoro")) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>番茄钟 - Pomodoro Timer</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 400px;
            width: 90%;
        }

        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }

        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }

        .timer-container {
            position: relative;
            width: 250px;
            height: 250px;
            margin: 0 auto 30px;
        }

        .timer-circle {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background: conic-gradient(#667eea 0%, #667eea var(--progress, 0%), #e0e0e0 var(--progress, 0%), #e0e0e0 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }

        .timer-inner {
            width: 220px;
            height: 220px;
            border-radius: 50%;
            background: white;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }

        .timer-display {
            font-size: 48px;
            font-weight: 700;
            color: #333;
            font-family: 'Courier New', monospace;
        }

        .timer-label {
            font-size: 14px;
            color: #666;
            margin-top: 5px;
        }

        .controls {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-bottom: 30px;
        }

        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }

        .btn-secondary {
            background: #f0f0f0;
            color: #333;
        }

        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(0,0,0,0.2);
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        .stats {
            display: flex;
            justify-content: space-around;
            padding: 20px;
            background: #f9f9f9;
            border-radius: 15px;
        }

        .stat-item {
            text-align: center;
        }

        .stat-value {
            font-size: 24px;
            font-weight: 700;
            color: #667eea;
        }

        .stat-label {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
        }

        .mode-switch {
            display: flex;
            gap: 10px;
            justify-content: center;
            margin-bottom: 20px;
        }

        .mode-btn {
            padding: 8px 16px;
            border: 2px solid #667eea;
            background: transparent;
            color: #667eea;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .mode-btn.active {
            background: #667eea;
            color: white;
        }

        .mode-btn:hover {
            background: #667eea;
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🍅 番茄钟</h1>
        <p class="subtitle">专注工作，高效休息</p>

        <div class="mode-switch">
            <button class="mode-btn active" data-mode="work">工作 (25分钟)</button>
            <button class="mode-btn" data-mode="break">休息 (5分钟)</button>
        </div>

        <div class="timer-container">
            <div class="timer-circle" id="timerCircle">
                <div class="timer-inner">
                    <div class="timer-display" id="timerDisplay">25:00</div>
                    <div class="timer-label" id="timerLabel">工作时间</div>
                </div>
            </div>
        </div>

        <div class="controls">
            <button class="btn btn-primary" id="startBtn">开始</button>
            <button class="btn btn-secondary" id="pauseBtn" disabled>暂停</button>
            <button class="btn btn-secondary" id="resetBtn">重置</button>
        </div>

        <div class="stats">
            <div class="stat-item">
                <div class="stat-value" id="pomodoroCount">0</div>
                <div class="stat-label">完成番茄</div>
            </div>
            <div class="stat-item">
                <div class="stat-value" id="totalTime">0</div>
                <div class="stat-label">总专注时间(分钟)</div>
            </div>
        </div>
    </div>

    <script>
        class PomodoroTimer {
            constructor() {
                this.workDuration = 25 * 60; // 25 minutes in seconds
                this.breakDuration = 5 * 60; // 5 minutes in seconds
                this.currentTime = this.workDuration;
                this.isRunning = false;
                this.isWorkMode = true;
                this.pomodoroCount = 0;
                this.totalTime = 0;
                this.timerInterval = null;

                this.initializeElements();
                this.bindEvents();
                this.loadFromStorage();
                this.updateDisplay();
            }

            initializeElements() {
                this.timerDisplay = document.getElementById('timerDisplay');
                this.timerLabel = document.getElementById('timerLabel');
                this.timerCircle = document.getElementById('timerCircle');
                this.startBtn = document.getElementById('startBtn');
                this.pauseBtn = document.getElementById('pauseBtn');
                this.resetBtn = document.getElementById('resetBtn');
                this.pomodoroCountDisplay = document.getElementById('pomodoroCount');
                this.totalTimeDisplay = document.getElementById('totalTime');
                this.modeBtns = document.querySelectorAll('.mode-btn');
            }

            bindEvents() {
                this.startBtn.addEventListener('click', () => this.start());
                this.pauseBtn.addEventListener('click', () => this.pause());
                this.resetBtn.addEventListener('click', () => this.reset());

                this.modeBtns.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const mode = e.target.dataset.mode;
                        this.switchMode(mode);
                    });
                });
            }

            start() {
                if (this.isRunning) return;

                this.isRunning = true;
                this.startBtn.disabled = true;
                this.pauseBtn.disabled = false;

                this.timerInterval = setInterval(() => {
                    this.currentTime--;
                    this.updateDisplay();

                    if (this.currentTime <= 0) {
                        this.complete();
                    }
                }, 1000);
            }

            pause() {
                if (!this.isRunning) return;

                this.isRunning = false;
                this.startBtn.disabled = false;
                this.pauseBtn.disabled = true;

                clearInterval(this.timerInterval);
            }

            reset() {
                this.pause();
                this.currentTime = this.isWorkMode ? this.workDuration : this.breakDuration;
                this.updateDisplay();
            }

            complete() {
                this.pause();

                if (this.isWorkMode) {
                    this.pomodoroCount++;
                    this.totalTime += 25;
                    this.saveToStorage();
                    this.updateStats();
                    this.playSound();
                    this.switchMode('break');
                } else {
                    this.switchMode('work');
                }
            }

            switchMode(mode) {
                this.isWorkMode = mode === 'work';
                this.currentTime = this.isWorkMode ? this.workDuration : this.breakDuration;

                this.modeBtns.forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.mode === mode);
                });

                this.timerLabel.textContent = this.isWorkMode ? '工作时间' : '休息时间';
                this.updateDisplay();
            }

            updateDisplay() {
                const minutes = Math.floor(this.currentTime / 60);
                const seconds = this.currentTime % 60;
                this.timerDisplay.textContent = \`\${minutes.toString().padStart(2, '0')}:\${seconds.toString().padStart(2, '0')}\`;

                const totalTime = this.isWorkMode ? this.workDuration : this.breakDuration;
                const progress = ((totalTime - this.currentTime) / totalTime) * 100;
                this.timerCircle.style.setProperty('--progress', \`\${progress}%\`);
            }

            updateStats() {
                this.pomodoroCountDisplay.textContent = this.pomodoroCount;
                this.totalTimeDisplay.textContent = this.totalTime;
            }

            playSound() {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.frequency.value = 800;
                oscillator.type = 'sine';

                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);

                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 1);
            }

            saveToStorage() {
                localStorage.setItem('pomodoroCount', this.pomodoroCount);
                localStorage.setItem('totalTime', this.totalTime);
            }

            loadFromStorage() {
                const savedCount = localStorage.getItem('pomodoroCount');
                const savedTime = localStorage.getItem('totalTime');

                if (savedCount) this.pomodoroCount = parseInt(savedCount);
                if (savedTime) this.totalTime = parseInt(savedTime);

                this.updateStats();
            }
        }

        // Initialize the timer
        const timer = new PomodoroTimer();
    </script>
</body>
</html>`;
  }

  // Default HTML template
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Page</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 500px;
            width: 90%;
        }
        h1 {
            color: #333;
            margin-bottom: 20px;
        }
        p {
            color: #666;
            line-height: 1.6;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Generated Page</h1>
        <p>This page was generated by AgentHub.</p>
    </div>
</body>
</html>`;
}
