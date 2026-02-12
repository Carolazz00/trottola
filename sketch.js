let svgImgs = [];
let loadedCount = 0;
let failed = [];
let items = [];

// ====== 自适应参数（随屏幕变化） ======
const SIZE_RATIO = 0.18; // 图形尺寸 = 短边 * 比例（推荐 0.14~0.22）
const SPEED_RATIO = 0.012; // 初始速度 = 短边 * 比例（推荐 0.008~0.02）
const MAXS_RATIO = 0.03; // 最大速度 = 短边 * 比例（推荐 0.02~0.05）

function responsiveSize() {
  // 可选：限制极端大小
  return Math.round(constrain(Math.min(width, height) * SIZE_RATIO, 90, 260));
}
function responsiveSpeedBase() {
  return Math.max(1.2, Math.min(width, height) * SPEED_RATIO);
}
function responsiveMaxSpeed() {
  return Math.max(3.0, Math.min(width, height) * MAXS_RATIO);
}

// ====== 物理参数 ======
const RESTITUTION_OBJ = 0.98;
const RESTITUTION_WALL = 0.98;

// ✅ 间隙（你之前要小一点）
const EXTRA_SEPARATION = 0.2;

// 陀螺：恒定转，只有碰撞才减速
const SPIN_START_MIN = 0.18;
const SPIN_START_MAX = 0.28;
const COLLISION_SPIN_LOSS = 0.94;
const MIN_SPIN = 0.06;
const SPIN_LOSS_COOLDOWN_FRAMES = 8;

// ====== 拖拽相关 ======
let dragging = null;
let dragOffX = 0;
let dragOffY = 0;
let prevMouseX = 0;
let prevMouseY = 0;
let dragVx = 0;
let dragVy = 0;

function setup() {
  createCanvas(window.innerWidth, window.innerHeight);
  angleMode(RADIANS);
  imageMode(CENTER);

  for (let i = 1; i <= 6; i++) {
    const path = `assets/${i}.svg`;
    loadImage(
      path,
      (img) => {
        svgImgs[i - 1] = img;
        loadedCount++;
      },
      () => {
        failed.push(path);
        loadedCount++;
      },
    );
  }
}

function draw() {
  background(0);

  if (loadedCount < 6) {
    drawLoading();
    return;
  }
  const okImgs = svgImgs.filter(Boolean);
  if (okImgs.length === 0) {
    drawAllFailed();
    return;
  }

  // 更新 + 撞墙反弹
  for (const it of items) {
    it.update();
    it.bounceWalls();
    it.clampSpeed();
  }

  // 拖动：跟随鼠标（仍旋转）
  if (dragging) {
    dragging.x = mouseX + dragOffX;
    dragging.y = mouseY + dragOffY;

    dragVx = mouseX - prevMouseX;
    dragVy = mouseY - prevMouseY;
    prevMouseX = mouseX;
    prevMouseY = mouseY;
  }

  // 物体-物体碰撞
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      resolveCircleCollision(items[i], items[j]);
    }
  }

  // 绘制
  for (const it of items) it.draw();

  // UI（可删）
  noStroke();
  fill(255);
  textSize(14);
  text(
    "Puoi cliccare per generare la forma del trottola e trascinare la figura per spostarla.",
    20,
    30,
  );
  text("numero: " + items.length, 20, 50);
}

function mousePressed() {
  // 优先选择拖动
  const hit = pickTopmost(mouseX, mouseY);
  if (hit) {
    dragging = hit;
    dragOffX = dragging.x - mouseX;
    dragOffY = dragging.y - mouseY;

    dragging.vx = 0;
    dragging.vy = 0;

    prevMouseX = mouseX;
    prevMouseY = mouseY;
    dragVx = 0;
    dragVy = 0;
    return;
  }

  // 否则生成
  const okImgs = svgImgs.filter(Boolean);
  if (okImgs.length === 0) return;

  const img = random(okImgs);
  items.push(new SpinnerSVG(mouseX, mouseY, img));
}

function mouseReleased() {
  if (dragging) {
    const ms = responsiveMaxSpeed();
    dragging.vx = constrain(dragVx, -ms, ms);
    dragging.vy = constrain(dragVy, -ms, ms);
    dragging = null;
  }
}

function windowResized() {
  resizeCanvas(window.innerWidth, window.innerHeight);

  // ✅ 尺寸随屏幕变化更新
  const newSize = responsiveSize();
  for (const it of items) {
    it.size = newSize;
    it.r = newSize * 0.5;
  }
}

// ------------------ UI ------------------
function drawLoading() {
  noStroke();
  fill(255);
  textSize(16);
  text(`Loading... ${loadedCount}/6`, 20, 30);
  if (failed.length > 0) {
    textSize(12);
    text(`加载失败: ${failed.join(", ")}`, 20, 52);
  }
}

function drawAllFailed() {
  noStroke();
  fill(255);
  textSize(16);
  text("SVG 全部加载失败：请检查 assets 路径和 Live Server。", 20, 30);
  textSize(12);
  text(`失败列表: ${failed.join(", ")}`, 20, 52);
}

// ------------------ Object ------------------
class SpinnerSVG {
  constructor(x, y, img) {
    this.x = x;
    this.y = y;
    this.img = img;

    this.size = responsiveSize();
    this.r = this.size * 0.5;

    const base = responsiveSpeedBase();
    this.vx = random(-base, base);
    this.vy = random(-base, base);

    this.a = random(TWO_PI);
    const w0 = random(SPIN_START_MIN, SPIN_START_MAX);
    this.w = random([-w0, w0]);

    this.spinLossCooldown = 0;
  }

  update() {
    if (this === dragging) {
      this.a += this.w;
      if (this.spinLossCooldown > 0) this.spinLossCooldown--;
      return;
    }

    this.x += this.vx;
    this.y += this.vy;
    this.a += this.w;

    if (this.spinLossCooldown > 0) this.spinLossCooldown--;
  }

  bounceWalls() {
    if (this === dragging) return;

    const e = RESTITUTION_WALL;

    if (this.x - this.r < 0) {
      this.x = this.r;
      this.vx = Math.abs(this.vx) * e;
      this.applySpinLossOnce();
    }
    if (this.x + this.r > width) {
      this.x = width - this.r;
      this.vx = -Math.abs(this.vx) * e;
      this.applySpinLossOnce();
    }
    if (this.y - this.r < 0) {
      this.y = this.r;
      this.vy = Math.abs(this.vy) * e;
      this.applySpinLossOnce();
    }
    if (this.y + this.r > height) {
      this.y = height - this.r;
      this.vy = -Math.abs(this.vy) * e;
      this.applySpinLossOnce();
    }
  }

  clampSpeed() {
    if (this === dragging) return;

    const ms = responsiveMaxSpeed();
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > ms) {
      const k = ms / sp;
      this.vx *= k;
      this.vy *= k;
    }
  }

  applySpinLossOnce() {
    if (this.spinLossCooldown > 0) return;

    const sign = this.w >= 0 ? 1 : -1;
    let mag = Math.abs(this.w);

    mag *= COLLISION_SPIN_LOSS;
    mag = Math.max(mag, MIN_SPIN);

    this.w = sign * mag;
    this.spinLossCooldown = SPIN_LOSS_COOLDOWN_FRAMES;
  }

  draw() {
    push();
    translate(this.x, this.y);
    rotate(this.a);
    image(this.img, 0, 0, this.size, this.size);
    pop();
  }
}

// ------------------ Picking ------------------
function pickTopmost(mx, my) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const dx = mx - it.x;
    const dy = my - it.y;
    if (dx * dx + dy * dy <= it.r * it.r) return it;
  }
  return null;
}

// ------------------ Collision ------------------
function resolveCircleCollision(A, B) {
  const AisDrag = A === dragging;
  const BisDrag = B === dragging;

  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const distSq = dx * dx + dy * dy;
  const minDist = A.r + B.r;

  if (distSq === 0) return;

  if (distSq < minDist * minDist) {
    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;

    const overlap = minDist - dist + EXTRA_SEPARATION;

    // 分离：拖动对象更“强势”
    if (AisDrag && !BisDrag) {
      B.x += nx * overlap;
      B.y += ny * overlap;
    } else if (!AisDrag && BisDrag) {
      A.x -= nx * overlap;
      A.y -= ny * overlap;
    } else {
      A.x -= nx * overlap * 0.5;
      A.y -= ny * overlap * 0.5;
      B.x += nx * overlap * 0.5;
      B.y += ny * overlap * 0.5;
    }

    // 冲量反弹
    const rvx = B.vx - A.vx;
    const rvy = B.vy - A.vy;
    const velAlongN = rvx * nx + rvy * ny;

    if (velAlongN > 0) {
      A.applySpinLossOnce();
      B.applySpinLossOnce();
      return;
    }

    const e = RESTITUTION_OBJ;
    const j = (-(1 + e) * velAlongN) / 2;
    const ix = j * nx;
    const iy = j * ny;

    if (AisDrag && !BisDrag) {
      B.vx += ix * 2;
      B.vy += iy * 2;
    } else if (!AisDrag && BisDrag) {
      A.vx -= ix * 2;
      A.vy -= iy * 2;
    } else {
      A.vx -= ix;
      A.vy -= iy;
      B.vx += ix;
      B.vy += iy;
    }

    A.applySpinLossOnce();
    B.applySpinLossOnce();
  }
}
