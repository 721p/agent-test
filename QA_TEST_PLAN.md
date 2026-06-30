# QA Test Plan — DOOM-like Raycaster

## Overview

This document defines the QA test plan for all iterations of the raycaster project. Each iteration covers the stories implemented in that sprint.

---

## Iteration 1 — Core Engine (Issues #1–#4)

> **Status:** ✅ QA Passed — all issues closed

### Issue #1 — Raycasting rendering
- [x] Walls render with correct perspective
- [x] Different wall types have distinct colors
- [x] No rendering artifacts or flickering
- [x] Performance is smooth at 60 FPS

### Issue #2 — Game loop & input handling
- [x] Game loop runs at consistent frame rate
- [x] Keyboard input is responsive
- [x] Mouse input is captured with pointer lock
- [x] No input lag or dropped frames

### Issue #3 — Player movement (WASD + mouse look)
- [x] W/S moves forward/backward along player direction
- [x] A/D strafes left/right
- [x] Mouse movement rotates view
- [x] Arrow keys rotate view as fallback
- [x] Collision detection prevents walking through walls
- [x] Movement is smooth with delta-time
- [x] Pointer lock works (click to capture, Esc to release)

### Issue #4 — Level system (JSON maps)
- [x] Level format is valid JSON with grid + wall types + spawn
- [x] Level loader parses JSON correctly
- [x] At least one 32x32 hand-designed level exists
- [x] Multiple wall types with different colors
- [x] Level includes corridors, rooms, and open areas
- [x] Mini-map renders top-down view of current level

---

## Iteration 2 — Combat & Enemies (Issues #7–#9)

> **Status:** 🔄 Pending QA — awaiting feature completion

### Issue #7 — Weapons & shooting

**Prerequisites:** Iteration 1 complete, `feature/7-weapons` branch merged.

#### Test Cases

| ID | Test Case | Steps | Expected Result | Pass/Fail |
|----|-----------|-------|-----------------|-----------|
| W-01 | Pistol fires on click | Equip pistol (press 1), click mouse | Muzzle flash appears, bullet raycast fires | ☐ |
| W-02 | Shotgun fires on click | Equip shotgun (press 2), click mouse | Muzzle flash appears, wider spread/different effect | ☐ |
| W-03 | Weapon cooldown | Click rapidly | Shots are limited by rate-of-fire cooldown | ☐ |
| W-04 | Weapon switching (1/2 keys) | Press 1 then 2 | Active weapon changes, sprite updates at bottom of screen | ☐ |
| W-05 | Ammo depletion (pistol) | Fire pistol until ammo runs out | Ammo counter decreases per shot, stops at 0 | ☐ |
| W-06 | Ammo depletion (shotgun) | Fire shotgun until ammo runs out | Ammo counter decreases per shot (larger decrement), stops at 0 | ☐ |
| W-07 | No ammo = no fire | Exhaust all ammo, click | Weapon does not fire, visual/audio feedback | ☐ |
| W-08 | Weapon sprite visible | Look at screen | DOOM-style weapon sprite visible at bottom-center | ☐ |
| W-09 | Muzzle flash timing | Fire weapon | Flash is brief (1–2 frames), not persistent | ☐ |
| W-10 | Hit detection — wall | Fire at a wall | Hit registers on nearest wall raycast | ☐ |
| W-11 | Hit detection — enemy | Fire at an enemy | Damage is applied to enemy | ☐ |
| W-12 | Hit detection — miss | Fire into open space away from enemies | No enemy hit registered | ☐ |

---

### Issue #8 — Enemy AI

**Prerequisites:** Iteration 1 complete, `feature/8-enemy-ai` branch merged.

#### Test Cases

| ID | Test Case | Steps | Expected Result | Pass/Fail |
|----|-----------|-------|-----------------|-----------|
| E-01 | Enemy spawns in level | Load level with enemies defined | Enemy entities appear at spawn positions | ☐ |
| E-02 | Enemy visible in 3D view | Face an enemy | Enemy sprite renders correctly in the raycast view | ☐ |
| E-03 | Enemy wandering (no player visible) | Observe enemy with player out of sight | Enemy moves/wanders randomly | ☐ |
| E-04 | Enemy chases player (line of sight) | Move into enemy's line of sight | Enemy begins moving toward player | ☐ |
| E-05 | Enemy loses sight of player | Break line of sight around a corner | Enemy stops chasing or returns to wander | ☐ |
| E-06 | Enemy contact damage | Let enemy reach player | Player takes damage on contact | ☐ |
| E-07 | Enemy ranged attack (if applicable) | Stand at distance in enemy's sight | Enemy performs ranged attack, player takes damage if hit | ☐ |
| E-08 | Enemy killed by player | Shoot enemy until health depleted | Enemy dies, death animation/effect plays | ☐ |
| E-09 | Multiple enemies coexist | Load level with 3+ enemies | All enemies render, move, and act independently | ☐ |
| E-10 | Enemy pathfinding around walls | Move around a corner while being chased | Enemy navigates around walls, does not clip through | ☐ |
| E-11 | Enemy state transitions | Observe enemy through full lifecycle | Idle → Wander → Chase → Attack → Dead transitions are correct | ☐ |
| E-12 | Enemy does not spawn inside wall | Load level | All enemies spawn in walkable tiles | ☐ |

---

### Issue #9 — Health, damage & pickups

**Prerequisites:** Iteration 1 complete, `feature/9-health` branch merged.

#### Test Cases

| ID | Test Case | Steps | Expected Result | Pass/Fail |
|----|-----------|-------|-----------------|-----------|
| H-01 | Player health starts at 100 | Load level | HUD shows health = 100 | ☐ |
| H-02 | Player takes damage from enemy | Let enemy attack player | Health decreases, HUD updates | ☐ |
| H-03 | Health pack heals | Pick up a health pack | Health increases (capped at 100), HUD updates | ☐ |
| H-04 | Health pack does not overheal | Pick up health pack at 90 HP | Health caps at 100, does not exceed | ☐ |
| H-05 | Ammo pickup refills ammo | Pick up an ammo pickup | Current weapon ammo increases, HUD updates | ☐ |
| H-06 | Pickups spawn at level positions | Load level with pickups defined | Pickups appear at correct positions in the world | ☐ |
| H-07 | Pickups disappear after collection | Walk over a pickup | Pickup is removed from the world and HUD updates | ☐ |
| H-08 | HUD shows health and ammo | Check HUD during gameplay | Both health and ammo values are visible and accurate | ☐ |
| H-09 | Death at 0 HP | Take damage until health reaches 0 | Player dies, death screen appears | ☐ |
| H-10 | Death screen has restart option | On death screen | "Restart" option is visible and clickable | ☐ |
| H-11 | Restart resets game state | Click restart on death screen | Level reloads, health=100, ammo reset, enemies respawn | ☐ |
| H-12 | Cannot act after death | On death screen, try to move/shoot | No player actions are possible until restart | ☐ |

---

## Test Execution Notes

- **Environment:** Latest `main` branch, Chromium-based browser
- **Tester:** Juno (QA Agent)
- **Method:** Manual browser-based testing + code review
- **Pass criteria:** All test cases marked Pass for an issue before applying `qa-passed` label

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-06-30 | Juno | Initial test plan (Iteration 1 complete, Iteration 2 added) |