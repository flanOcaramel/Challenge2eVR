/* 
 * move-objects.js
 * Implements physics-based grabbing using Ammo.js constraints.
 * Compatible with 'movement="type: grabbable"' attribute pattern.
 */

AFRAME.registerComponent('grab-control', {
    schema: {
        hand: { default: 'right' },
        button: { default: 'trigger' } // trigger or grip
    },

    init: function () {
        this.constraint = null;
        this.grabbedObject = null;
        
        // Ensure Physics system is ready
        this.el.sceneEl.addEventListener('body-loaded', this.onBodyLoaded.bind(this));
        
        // Bind event listeners
        this.onButtonDown = this.onButtonDown.bind(this);
        this.onButtonUp = this.onButtonUp.bind(this);
        
        this.el.addEventListener(this.data.button + 'down', this.onButtonDown);
        this.el.addEventListener(this.data.button + 'up', this.onButtonUp);
    },

    onBodyLoaded: function() {
        // Physics body of the hand (kinematic)
    },

    onButtonDown: function () {
        if (this.grabbedObject) return; // Already holding something

        // Find close interactable objects
        // We use the hand's position and a small radius
        const handPos = new THREE.Vector3();
        this.el.object3D.getWorldPosition(handPos);
        
        const els = this.el.sceneEl.querySelectorAll('[ammo-body]');
        let closestEl = null;
        let minDist = 0.3; // Interaction radius (meters)

        for (let i = 0; i < els.length; i++) {
            const el = els[i];
            if (el === this.el) continue; // Don't grab self

            // Check if object is 'grabbable' via movement component or just logic
            // The doc mentions movement="type: grabbable"
            const movement = el.getAttribute('movement');
            const isGrabbable = movement && movement.type === 'grabbable';
            
            // Also check mixins if attribute not directly present (A-Frame handles this usually via getAttribute if mixin applied)
            if (!isGrabbable) continue;

            const mesh = el.getObject3D('mesh');
            if (!mesh) continue;

            const objPos = new THREE.Vector3();
            el.object3D.getWorldPosition(objPos);
            const dist = handPos.distanceTo(objPos);

            if (dist < minDist) {
                minDist = dist;
                closestEl = el;
            }
        }

        if (closestEl) {
            this.grab(closestEl);
        }
    },

    onButtonUp: function () {
        if (this.grabbedObject) {
            this.release();
        }
    },

    grab: function (el) {
        const handBody = this.el.body;
        const objectBody = el.body;

        if (!handBody || !objectBody) return;

        this.grabbedObject = el;

        // Ammo.js Constraint
        // We want to lock the object to the hand relative to current offset
        // But for simplicity, a LockConstraint is often easiest for rigid attachment
        
        /* 
           NOTE: In A-Frame Physics with Ammo, accessing the raw Ammo pointer is needed.
           The 'el.body' IS the ammo body pointer in the default aframe-physics-system ammo driver? 
           Actually, usually el.body is the localized wrapper or the raw object depending on version.
           With standard ammo-driver (MozillaReality), el.body is the btRigidBody.
        */
        
        // Create Constraint
        // For a simple 'stick to hand': p2p or lock.
        // LockConstraint (6DOF locked) is good for "holding".
        
        const ammo = window.Ammo;
        if (!ammo) return;

        // Position of object relative to hand
        const handWorldInv = new ammo.btTransform();
        handBody.getWorldTransform(handWorldInv);
        handWorldInv.inverse();

        const objWorld = new ammo.btTransform();
        objectBody.getWorldTransform(objWorld);

        const localFrameA = new ammo.btTransform();
        localFrameA.op_mul(handWorldInv, objWorld); // offset in hand frame
        
        const localFrameB = new ammo.btTransform(); 
        localFrameB.setIdentity(); // origin of object

        // Create Generic6DofConstraint for locking
        // Or simple Point2Point for dangly. Let's try Lock (fixed relative).
        // 6DOF with all limits 0 = fixed.
        
        this.constraint = new ammo.btGeneric6DofConstraint(
            handBody, 
            objectBody, 
            localFrameA, 
            localFrameB, 
            false
        );

        // Lock all axes
        const lower = new ammo.btVector3(0, 0, 0);
        const upper = new ammo.btVector3(0, 0, 0);
        
        this.constraint.setLinearLowerLimit(lower);
        this.constraint.setLinearUpperLimit(upper);
        this.constraint.setAngularLowerLimit(lower);
        this.constraint.setAngularUpperLimit(upper);

        // Add to physics world
        const physicsSystem = this.el.sceneEl.systems.physics;
        physicsSystem.driver.physicsWorld.addConstraint(this.constraint, true); // true = disable collisions between linked bodies
        
        // Clean up temp objects
        ammo.destroy(lower);
        ammo.destroy(upper);
        ammo.destroy(handWorldInv);
        ammo.destroy(objWorld);
        ammo.destroy(localFrameA);
        ammo.destroy(localFrameB);
        
        // Optional: Signal grab
        el.emit('grab-start');
        
        // Keep active (prevent sleeping)
        objectBody.setActivationState(4); // DISABLE_DEACTIVATION
    },

    release: function () {
        if (!this.constraint) return;

        const physicsSystem = this.el.sceneEl.systems.physics;
        physicsSystem.driver.physicsWorld.removeConstraint(this.constraint);
        ammo.destroy(this.constraint);
        this.constraint = null;

        if (this.grabbedObject) {
             const body = this.grabbedObject.body;
             // Re-enable sleeping logic if desired, or just wake it up once
             body.setActivationState(1); // ACTIVE_TAG
             this.grabbedObject.emit('grab-end');
             this.grabbedObject = null;
        }
    }
});
