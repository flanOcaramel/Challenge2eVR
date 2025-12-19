// Teleport arc component compatible with Ammo (aframe-physics-system).
// Left controller: press trigger to show arc, release to teleport.
// Marks valid landing surfaces via class "teleportable".

AFRAME.registerComponent('teleport-arc', {
  schema: {
    samples: { type: 'int', default: 30 },
    velocity: { type: 'number', default: 6.0 },
    gravity: { type: 'vec3', default: { x: 0, y: -9.8, z: 0 } },
    rig: { type: 'selector', default: '#rig' },
    landingClass: { type: 'string', default: 'teleportable' }
  },

  init: function () {
    this.visible = false;
    this.hitPoint = null;
    this.sceneEl = this.el.sceneEl;
    this.cameraRig = document.querySelector(this.data.rig) || this.data.rig;

    // Line for arc
    const material = new THREE.LineBasicMaterial({ color: 0x66ffcc, linewidth: 2 });
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.data.samples * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.line = new THREE.Line(geometry, material);
    this.line.frustumCulled = false;
    this.el.object3D.add(this.line);
    this.line.visible = false;

    // cursor for landing point
    const cursorGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const cursorMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
    this.cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
    this.cursorMesh.visible = false;
    this.sceneEl.object3D.add(this.cursorMesh);

    this.showArc = this.showArc.bind(this);
    this.doTeleport = this.doTeleport.bind(this);
    this.hideArc = this.hideArc.bind(this);

    this.el.addEventListener('triggerdown', this.showArc);
    this.el.addEventListener('triggerup', this.doTeleport);
    // also hide if controller lost
    this.el.addEventListener('controllerdisconnected', this.hideArc);
  },

  showArc: function () {
    this.visible = true;
    this.line.visible = true;
    this.cursorMesh.visible = false;
  },

  hideArc: function () {
    this.visible = false;
    this.line.visible = false;
    this.cursorMesh.visible = false;
    this.hitPoint = null;
  },

  doTeleport: function () {
    if (!this.visible) return;
    if (this.hitPoint && this.cameraRig) {
      const camera = this.sceneEl.camera;
      if (!camera) return;
      const cameraWorldPos = new THREE.Vector3();
      camera.getWorldPosition(cameraWorldPos);

      const rigEl = this.cameraRig;
      const rigObj = rigEl.object3D;
      const rigWorldPos = new THREE.Vector3();
      rigObj.getWorldPosition(rigWorldPos);

      const offset = cameraWorldPos.sub(rigWorldPos);
      const newRigWorld = new THREE.Vector3().copy(this.hitPoint).sub(offset);

      // If rig has ammo-body, set its body position; otherwise set object3D position
      if (rigEl && rigEl.getAttribute && rigEl.getAttribute('ammo-body')) {
        // Try to update physics body if present
        if (rigEl.body) {
          try {
            rigEl.body.setWorldTransform && rigEl.body.setWorldTransform(new CANNON ? new CANNON.Transform() : null);
          } catch (e) {
            // fallback to object3D
            if (rigObj.parent) rigObj.parent.worldToLocal(newRigWorld);
            rigObj.position.copy(newRigWorld);
          }
        } else {
          if (rigObj.parent) rigObj.parent.worldToLocal(newRigWorld);
          rigObj.position.copy(newRigWorld);
        }
      } else {
        if (rigObj.parent) rigObj.parent.worldToLocal(newRigWorld);
        rigObj.position.copy(newRigWorld);
      }
    }
    this.hideArc();
  },

  tick: function () {
    if (!this.visible) return;
    const samples = this.data.samples;
    const positions = this.line.geometry.attributes.position.array;
    const worldPos = new THREE.Vector3();
    const worldDir = new THREE.Vector3(0, 0, -1);
    this.el.object3D.getWorldPosition(worldPos);
    this.el.object3D.getWorldDirection(worldDir);
    const forward = worldDir.normalize();

    const g = new THREE.Vector3(this.data.gravity.x, this.data.gravity.y, this.data.gravity.z);
    const v0 = forward.clone().multiplyScalar(this.data.velocity);

    let prevPoint = null;
    let hit = null;
    const raycaster = new THREE.Raycaster();

    for (let i = 0; i < samples; i++) {
      const t = i * 0.06;
      const pos = new THREE.Vector3().copy(worldPos)
        .addScaledVector(v0, t)
        .addScaledVector(g, 0.5 * t * t);

      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      if (prevPoint) {
        const segDir = new THREE.Vector3().subVectors(pos, prevPoint);
        const len = segDir.length();
        if (len > 0) {
          segDir.normalize();
          raycaster.set(prevPoint, segDir);
          raycaster.far = len;
          const intersects = raycaster.intersectObjects(this.sceneEl.object3D.children, true);
          for (let j = 0; j < intersects.length; j++) {
            const obj = intersects[j].object;
            const el = obj.el;
            if (el && el.classList && el.classList.contains(this.data.landingClass)) {
              hit = intersects[j].point.clone();
              break;
            }
          }
          if (hit) break;
        }
      }
      prevPoint = pos.clone();
    }

    this.line.geometry.attributes.position.needsUpdate = true;
    if (hit) {
      this.hitPoint = hit;
      this.cursorMesh.position.copy(hit);
      this.cursorMesh.visible = false;
    } else {
      this.hitPoint = null;
      this.cursorMesh.visible = false;
    }
  },

  remove: function () {
    this.el.removeEventListener('triggerdown', this.showArc);
    this.el.removeEventListener('triggerup', this.doTeleport);
    this.el.removeEventListener('controllerdisconnected', this.hideArc);
    if (this.line && this.line.parent) this.line.parent.remove(this.line);
    if (this.cursorMesh && this.cursorMesh.parent) this.cursorMesh.parent.remove(this.cursorMesh);
  }
});
