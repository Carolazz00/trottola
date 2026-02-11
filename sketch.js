let svgImgs = [];
let loadedCount = 0;
let failed = [];
let items = [];

// ====== 参数 ======
const FIXED_SIZE = 180;
const RESTITUTION_OBJ = 0.98;
const RESTITUTION_WALL = 0.98;
const EXTRA_SEPARATION = 1.0;
const MAX_SPEED = 6.0;

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

  // ✅ 拖动时：直接把目标跟随鼠标（仍保持旋转）
  if (dragging) {
    dragging.x = mouseX + dragOffX;
    dragging.y = mouseY + dragOffY;

    // 估算甩动速度（像惯性一样丢出去）
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
  text("点击生成；拖动图形；碰撞/撞墙反弹（旋转只在碰撞时减速）", 20, 30);
  text("数量: " + items.length, 20, 50);
}

function mousePressed() {
  // 1) 优先：如果按到某个图形，就进入拖动
  const hit = pickTopmost(mouseX, mouseY);
  if (hit) {
    dragging = hit;
    dragOffX = dragging.x - mouseX;
    dragOffY = dragging.y - mouseY;

    // 拖动开始：速度归零，避免抖动（旋转仍然保留）
    dragging.vx = 0;
    dragging.vy = 0;

    prevMouseX = mouseX;
    prevMouseY = mouseY;
    dragVx = 0;
    dragVy = 0;
    return;
  }

  // 2) 否则：生成一个新图形
  const okImgs = svgImgs.filter(Boolean);
  if (okImgs.length === 0) return;
  const img = random(okImgs);
  items.push(new SpinnerSVG(mouseX, mouseY, img));
}

function mouseReleased() {
  // 松手：把甩动速度给回去
  if (dragging) {
    dragging.vx = constrain(dragVx, -MAX_SPEED, MAX_SPEED);
    dragging.vy = constrain(dragVy, -MAX_SPEED, MAX_SPEED);
    dragging = null;
  }
}

function windowResized() {
  resizeCanvas(window.innerWidth, window.innerHeight);
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

    this.size = FIXED_SIZE;
    this.r = this.size * 0.5;

    this.vx = random(-3.2, 3.2);
    this.vy = random(-2.8, 2.8);

    this.a = random(TWO_PI);
    const w0 = random(SPIN_START_MIN, SPIN_START_MAX);
    this.w = random([-w0, w0]);

    this.spinLossCooldown = 0;
  }

  update() {
    // ✅ 拖动时：位置由鼠标控制，不做位移积分（避免打架）
    if (this === dragging) {
      this.a += this.w; // 仍然旋转
      if (this.spinLossCooldown > 0) this.spinLossCooldown--;
      return;
    }

    this.x += this.vx;
    this.y += this.vy;
    this.a += this.w;

    if (this.spinLossCooldown > 0) this.spinLossCooldown--;
  }

  bounceWalls() {
    // 拖动中不做撞墙反弹（否则鼠标拖不动）
    if (this === dragging) return;

    if (this.x - this.r < 0) {
      this.x = this.r;
      this.vx = Math.abs(this.vx) * RESTITUTION_WALL;
      this.applySpinLossOnce();
    }
    if (this.x + this.r > width) {
      this.x = width - this.r;
      this.vx = -Math.abs(this.vx) * RESTITUTION_WALL;
      this.applySpinLossOnce();
    }
    if (this.y - this.r < 0) {
      this.y = this.r;
      this.vy = Math.abs(this.vy) * RESTITUTION_WALL;
      this.applySpinLossOnce();
    }
    if (this.y + this.r > height) {
      this.y = height - this.r;
      this.vy = -Math.abs(this.vy) * RESTITUTION_WALL;
      this.applySpinLossOnce();
    }
  }

  clampSpeed() {
    if (this === dragging) return;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > MAX_SPEED) {
      const k = MAX_SPEED / sp;
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
// 选中“最上层”的（数组末尾当作最上层），命中用圆形近似
function pickTopmost(mx, my) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const dx = mx - it.x;
    const dy = my - it.y;
    if (dx * dx + dy * dy <= it.r * it.r) return it;
  }
  return null;
}

// ------------------ Collision (Circle Approx) ------------------
function resolveCircleCollision(A, B) {
  // 拖动中的物体仍然可以被撞开，但为了稳定：
  // 让拖动对象“更强势”，只推动另一方更自然
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

    // 分离：若其中一个在拖动，则主要推开另一个
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

    // 冲量反弹（拖动的物体不参与速度积分，只改变另一方的速度更稳定）
    const rvx = B.vx - A.vx;
    const rvy = B.vy - A.vy;
    const velAlongN = rvx * nx + rvy * ny;

    if (velAlongN > 0) {
      A.applySpinLossOnce();
      B.applySpinLossOnce();
      return;
    }

    const j = (-(1 + RESTITUTION_OBJ) * velAlongN) / 2;
    const ix = j * nx;
    const iy = j * ny;

    if (AisDrag && !BisDrag) {
      B.vx += ix * 2; // A 不动，把冲量全给 B
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
