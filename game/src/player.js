// player.js — the human player: first-person movement with acceleration
// and friction, gravity and jumping, crouching, wall sliding, health and
// armor. Armor absorbs half of incoming damage until it is gone. The camera
// rides at eye height with a small head-bob and weapon recoil kick.
import * as THREE from 'three';
import { clamp, damp } from './util.js';

const EYE_STAND = 1.62;
const EYE_CROUCH = 1.12;
const RADIUS = 0.42;
const WALK_SPEED = 5.2;
const SPRINT_SPEED = 6.4;
const CROUCH_SPEED = 2.6;
const ACCEL = 42;
const FRICTION = 10;
const GRAVITY = 18;
const JUMP_VEL = 6.4;

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(-27, 0, 15);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI * 0.78; // facing north-east, up the yard toward mid
    this.pitch = 0;
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.onGround = true;
    this.eyeHeight = EYE_STAND;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.recoil = 0;
    this.stepTimer = 0;
    this.onStep = null;
    this.onLand = null;
    this.moving = false;
    this.crouching = false;
  }

  reset(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.health = 100;
    this.alive = true;
    this.onGround = true;
    this.recoil = 0;
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0022;
    this.pitch = clamp(this.pitch - dy * 0.0022, -1.45, 1.45);
  }

  // Returns true when the player died from this hit.
  damage(amount, hitHead = false) {
    if (!this.alive) return false;
    let remaining = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, remaining * 0.5);
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.health -= remaining;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      return true;
    }
    return false;
  }

  healFull() { this.health = 100; }

  update(dt, input, world) {
    if (!this.alive) return;
    this.crouching = input.crouch;
    const speed = this.crouching ? CROUCH_SPEED : input.walk ? WALK_SPEED * 0.55 : WALK_SPEED;
    const sprint = !input.walk && !this.crouching && input.moveZ > 0;
    const top = sprint ? SPRINT_SPEED : speed;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // Forward is -Z rotated by yaw; strafe is perpendicular.
    const fx = -sin, fz = -cos;
    const rx = cos, rz = -sin;
    const mx = input.moveX, mz = input.moveZ;
    const len = Math.hypot(mx, mz) || 1;
    const wishX = (fx * mz + rx * mx) / len * top;
    const wishZ = (fz * mz + rz * mx) / len * top;
    const hasInput = mx !== 0 || mz !== 0;
    this.moving = hasInput && this.onGround;
    // Accelerate toward the wish velocity, friction when no input.
    const rate = hasInput ? ACCEL : FRICTION;
    this.vel.x = damp(this.vel.x, hasInput ? wishX : 0, rate / top * 4.2, dt);
    this.vel.z = damp(this.vel.z, hasInput ? wishZ : 0, rate / top * 4.2, dt);
    // Jump.
    if (input.jump && this.onGround) {
      this.vel.y = JUMP_VEL;
      this.onGround = false;
    }
    this.vel.y -= GRAVITY * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) {
      if (!this.onGround && this.vel.y < -6 && this.onLand) this.onLand();
      this.pos.y = 0;
      this.vel.y = 0;
      this.onGround = true;
    }
    world.collideCircle(this.pos, RADIUS, 1.7);
    // Head bob + footsteps while moving on the ground.
    const planar = Math.hypot(this.vel.x, this.vel.z);
    this.bobAmount = damp(this.bobAmount, this.moving ? Math.min(1, planar / 5) : 0, 8, dt);
    this.bobPhase += planar * dt * 1.6;
    this.stepTimer -= dt * planar;
    if (this.moving && this.stepTimer <= 0) {
      this.stepTimer = 2.4;
      if (this.onStep) this.onStep();
    }
    const targetEye = this.crouching ? EYE_CROUCH : EYE_STAND;
    this.eyeHeight = damp(this.eyeHeight, targetEye, 12, dt);
    this.recoil = damp(this.recoil, 0, 9, dt);
    const bobY = Math.sin(this.bobPhase * 2) * 0.035 * this.bobAmount;
    this.camera.position.set(this.pos.x, this.pos.y + this.eyeHeight + bobY, this.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + this.recoil;
    this.camera.rotation.z = 0;
  }
}
