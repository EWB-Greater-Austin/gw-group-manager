var FORM_ID                      = '1glQ5poNzEwmCqN5yx2njjYz6GeCalsEmdy_Z1EHLW3U';
var EMAIL_QUESTION_TITLE         = 'Email address';
var SUBSCRIPTIONS_QUESTION_TITLE = 'What do you want receive emails about? (Leave all boxes unchecked if you wish to completely unsubscribe from all EWBGA emails)';

// Form checkbox option label → Google Group email. The form must use these
// exact strings as its checkbox option labels — that is how a tick maps to
// a group.
var GROUPS = {
  '(👷 EWB General) Internal communications for EWBGA members, meetings, socials, etc.': 'ewbgeneral@ewbgreateraustin.org',
  '(🌍 Newsletter) Quarterly updates on everything the chapter has been doing!':          'newsletter@ewbgreateraustin.org'
};

// Entry point — runs on each form submission via the installable trigger.
function onSubmit(e) {
  var data = parseResponse(e.response);
  if (!data.email) {
    console.error('No email in submission; skipping.');
    return;
  }

  Object.keys(GROUPS).forEach(function(label) {
    var groupEmail = GROUPS[label];
    var wantsIn    = data.selections.indexOf(label) !== -1;
    try {
      if (wantsIn) {
        ensureMember(groupEmail, data.email);
      } else {
        ensureNotMember(groupEmail, data.email);
      }
    } catch (err) {
      console.error('Failed updating ' + data.email + ' on ' + groupEmail + ': ' + err);
    }
  });
}

function parseResponse(formResponse) {
  var email      = '';
  var selections = [];
  formResponse.getItemResponses().forEach(function(itemResp) {
    var title = itemResp.getItem().getTitle();
    var resp  = itemResp.getResponse();
    if (title === EMAIL_QUESTION_TITLE) {
      email = String(resp).trim().toLowerCase();
    } else if (title === SUBSCRIPTIONS_QUESTION_TITLE) {
      // Checkbox questions return an Array of selected option strings.
      selections = Array.isArray(resp) ? resp : [resp];
    }
  });
  return { email: email, selections: selections };
}

// Idempotent add — checking membership first avoids the 409 that
// Members.insert throws on an existing member, so replays of the same
// submission are safe.
function ensureMember(groupEmail, memberEmail) {
  if (isMember(groupEmail, memberEmail)) {
    console.log(memberEmail + ' already in ' + groupEmail);
    return;
  }
  AdminDirectory.Members.insert({ email: memberEmail, role: 'MEMBER' }, groupEmail);
  console.log('Added ' + memberEmail + ' to ' + groupEmail);
}

function ensureNotMember(groupEmail, memberEmail) {
  if (!isMember(groupEmail, memberEmail)) {
    console.log(memberEmail + ' not in ' + groupEmail + '; nothing to remove');
    return;
  }
  AdminDirectory.Members.remove(groupEmail, memberEmail);
  console.log('Removed ' + memberEmail + ' from ' + groupEmail);
}

function isMember(groupEmail, memberEmail) {
  try {
    AdminDirectory.Members.get(groupEmail, memberEmail);
    return true;
  } catch (e) {
    if (isNotFound(e)) return false;
    throw e;
  }
}

function isNotFound(e) {
  var msg = (e && e.message) ? e.message : '';
  return msg.indexOf('404') !== -1 || msg.toLowerCase().indexOf('not found') !== -1;
}

// Logs the change that would happen for a given email + tick set without
// touching the live groups. Useful when verifying the form's question titles
// and option labels line up with the constants above.
function dryRun(testEmail, testSelections) {
  testSelections = testSelections || [];
  Object.keys(GROUPS).forEach(function(label) {
    var groupEmail = GROUPS[label];
    var current    = isMember(groupEmail, testEmail);
    var wantsIn    = testSelections.indexOf(label) !== -1;
    var action;
    if (wantsIn && !current)      action = 'WOULD ADD';
    else if (!wantsIn && current) action = 'WOULD REMOVE';
    else                          action = 'no change';
    console.log(action + ': ' + testEmail + ' / ' + groupEmail);
  });
}

// Run once manually to install the onFormSubmit trigger.
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'onSubmit') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('onSubmit').forForm(FORM_ID).onFormSubmit().create();
  console.log('onFormSubmit trigger installed for form ' + FORM_ID);
}
