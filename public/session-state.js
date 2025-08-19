(function(){
  const state = {
    uid: null,
    user_role: null,
    contractor_id: null,
    ready: false
  };

  try {
    state.user_role = localStorage.getItem('user_role');
    state.contractor_id = localStorage.getItem('contractor_id');
  } catch (e) {}

  let resolveReady;
  const readyPromise = new Promise(res => { resolveReady = res; });

  function emit(){
    window.dispatchEvent(new CustomEvent('session-state-changed', {detail: {...state}}));
  }

  if (window.firebase && firebase.auth) {
    firebase.auth().onAuthStateChanged(async user => {
      if (!user) {
        state.uid = null;
        state.user_role = null;
        state.contractor_id = null;
        state.ready = true;
        try {
          localStorage.removeItem('user_role');
          localStorage.removeItem('contractor_id');
        } catch(e){}
        emit();
        resolveReady(state);
        return;
      }

      state.uid = user.uid;
      let role = state.user_role;
      let contractorId = state.contractor_id;

      if (!role || (role === 'staff' && !contractorId)) {
        try {
          const db = firebase.firestore();
          const contractorSnap = await db.collection('contractors').doc(user.uid).get();
          if (contractorSnap.exists && contractorSnap.data().role === 'contractor') {
            role = 'contractor';
            contractorId = user.uid;
          } else {
            const staffQuery = await db
              .collectionGroup('staff')
              .where(firebase.firestore.FieldPath.documentId(), '==', user.uid)
              .limit(1)
              .get();
            if (!staffQuery.empty) {
              const data = staffQuery.docs[0].data();
              if ((data.role || '').toLowerCase() === 'staff') {
                role = 'staff';
                contractorId = data.contractorId;
              }
            }
          }
        } catch(err){ console.error('[SessionState] role lookup failed', err); }
        try {
          if (role) localStorage.setItem('user_role', role); else localStorage.removeItem('user_role');
          if (contractorId) localStorage.setItem('contractor_id', contractorId); else localStorage.removeItem('contractor_id');
        } catch(e){}
      }

      state.user_role = role;
      state.contractor_id = contractorId;
      state.ready = true;
      emit();
      resolveReady(state);
    });
  } else {
    // If firebase isn't ready yet, resolve immediately with whatever is cached
    state.ready = true;
    resolveReady(state);
  }

  window.SessionState = {
    ready: () => readyPromise,
    get: () => ({...state}),
    onChange: (fn) => window.addEventListener('session-state-changed', e => fn(e.detail)),
    set: (role, contractorId) => {
      state.user_role = role || null;
      state.contractor_id = contractorId || null;
      try {
        if (state.user_role) localStorage.setItem('user_role', state.user_role); else localStorage.removeItem('user_role');
        if (state.contractor_id) localStorage.setItem('contractor_id', state.contractor_id); else localStorage.removeItem('contractor_id');
      } catch(e){}
      emit();
    },
    clear: () => {
      state.uid = null;
      state.user_role = null;
      state.contractor_id = null;
      state.ready = true;
      try {
        localStorage.removeItem('user_role');
        localStorage.removeItem('contractor_id');
      } catch(e){}
      emit();
    }
  };
})();
