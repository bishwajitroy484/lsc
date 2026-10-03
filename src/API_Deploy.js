/**
 * In-app web app version publish (stable /exec URL).
 *
 * After clasp push, an owner clicks Publish in Settings to:
 * 1) create a new Apps Script version from HEAD
 * 2) point the existing web-app deployment at that version
 *
 * Runs as the deployer (Execute as: Me), so Mail/Calendar identity stays put.
 * Requires Apps Script API enabled on the script's GCP project (one-time).
 */

function getDeployScriptId_() {
  try {
    if (typeof ScriptApp !== 'undefined' && ScriptApp.getScriptId) {
      const id = String(ScriptApp.getScriptId() || '').trim();
      if (id) return id;
    }
  } catch (error) {
    // fall through
  }
  return String(typeof LSC_SCRIPT_ID !== 'undefined' ? LSC_SCRIPT_ID : '').trim();
}

function getConfiguredDeploymentId_() {
  try {
    const settings = typeof readSettingsMapForAccess_ === 'function' ? readSettingsMapForAccess_() : {};
    const fromSettings = String(settings.WEBAPP_DEPLOYMENT_ID || '').trim();
    if (fromSettings) return fromSettings;
  } catch (error) {
    // fall through
  }
  return String(typeof LSC_DEPLOYMENT_ID !== 'undefined' ? LSC_DEPLOYMENT_ID : '').trim();
}

function getDeployEnvLabel_() {
  const env = String(typeof LSC_ENV !== 'undefined' ? LSC_ENV : '').trim().toLowerCase();
  if (env === 'prod') return 'Prod';
  if (env === 'dev') return 'Dev';
  return env ? env : 'Unknown';
}

function requireOwnerForDeploy_() {
  const context = typeof getCurrentUserContext_ === 'function' ? getCurrentUserContext_() : null;
  if (!context || !context.allowed) {
    return {
      ok: false,
      response: {
        success: false,
        error: (context && context.error) || 'Access denied.',
        code: 'FORBIDDEN'
      }
    };
  }
  if (!context.isOwner) {
    return {
      ok: false,
      response: {
        success: false,
        error: 'Only an owner can publish a new web app version.',
        code: 'FORBIDDEN'
      }
    };
  }
  return { ok: true, context: context };
}

function appsScriptApiRequest_(method, path, bodyObj) {
  const token = ScriptApp.getOAuthToken();
  const options = {
    method: String(method || 'get').toLowerCase(),
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json'
    },
    muteHttpExceptions: true,
    followRedirects: true
  };
  if (bodyObj !== undefined && bodyObj !== null) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(bodyObj);
  }
  const url = 'https://script.googleapis.com/v1/' + String(path || '').replace(/^\//, '');
  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const text = response.getContentText() || '';
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (parseError) {
    json = null;
  }
  return { code: code, text: text, json: json };
}

function formatAppsScriptApiError_(result, fallback) {
  const err = result && result.json && result.json.error ? result.json.error : null;
  const message = err && err.message ? String(err.message) : '';
  const status = err && err.status ? String(err.status) : '';
  const details = err && err.details ? err.details : null;
  const blob = (message + ' ' + status + ' ' + JSON.stringify(details || {})).toLowerCase();

  if (
    blob.indexOf('accessnotconfigured') >= 0 ||
    blob.indexOf('has not been used') >= 0 ||
    blob.indexOf('disabled') >= 0 ||
    blob.indexOf('apps script api') >= 0
  ) {
    return 'Apps Script API is not enabled for this project. In the Apps Script editor open Project Settings → Google Cloud Platform (GCP) Project, use a standard Cloud project, enable “Apps Script API”, then click Authorize again in Settings.';
  }
  if (
    blob.indexOf('insufficient') >= 0 ||
    blob.indexOf('permission') >= 0 ||
    blob.indexOf('unauthorized') >= 0 ||
    blob.indexOf('auth') >= 0 ||
    (result && (result.code === 401 || result.code === 403))
  ) {
    return 'Extra Google permission is required to publish versions. Click Authorize Google services in Setup, complete consent (script projects + deployments), then try again.';
  }
  if (message) return message;
  if (result && result.text) {
    const trimmed = String(result.text).trim();
    if (trimmed) return trimmed.slice(0, 280);
  }
  return fallback || 'Apps Script API request failed.';
}

function buildDeployStatusPayload_(extras) {
  const settings = typeof readSettingsMapForAccess_ === 'function' ? readSettingsMapForAccess_() : {};
  const deploymentId = getConfiguredDeploymentId_();
  const scriptId = getDeployScriptId_();
  const base = {
    env: getDeployEnvLabel_(),
    envKey: String(typeof LSC_ENV !== 'undefined' ? LSC_ENV : '').trim().toLowerCase(),
    scriptId: scriptId,
    deploymentId: deploymentId,
    deploymentIdSource: String(settings.WEBAPP_DEPLOYMENT_ID || '').trim()
      ? 'settings'
      : (String(typeof LSC_DEPLOYMENT_ID !== 'undefined' ? LSC_DEPLOYMENT_ID : '').trim() ? 'config' : 'missing'),
    webAppUrl: deploymentId
      ? ('https://script.google.com/macros/s/' + deploymentId + '/exec')
      : (typeof getWebAppUrl_ === 'function' ? getWebAppUrl_() : ''),
    currentVersion: null,
    currentDescription: '',
    lastPublishedVersion: String(settings.WEBAPP_LAST_VERSION || '').trim() || null,
    lastPublishedAt: String(settings.WEBAPP_LAST_PUBLISHED_AT || '').trim() || '',
    lastPublishedBy: String(settings.WEBAPP_LAST_PUBLISHED_BY || '').trim() || '',
    apiReady: false,
    canPublish: false,
    hint: ''
  };
  if (extras && typeof extras === 'object') {
    Object.keys(extras).forEach(function(key) {
      base[key] = extras[key];
    });
  }
  if (!base.deploymentId) {
    base.hint = 'Add the stable web app deployment ID (from config/env.json or paste below), then Save ID.';
  } else if (!base.apiReady) {
    base.hint = base.hint || 'Authorize Google services, then publish after each code push.';
  }
  return base;
}

function api_getWebAppDeployStatus() {
  try {
    const gate = typeof requirePermission_ === 'function'
      ? requirePermission_('settings', 'view')
      : { ok: false, response: { success: false, error: 'Access denied.', code: 'FORBIDDEN' } };
    if (!gate.ok) {
      const ownerGate = requireOwnerForDeploy_();
      if (!ownerGate.ok) return gate.response;
    }

    const scriptId = getDeployScriptId_();
    const deploymentId = getConfiguredDeploymentId_();
    if (!scriptId || !deploymentId) {
      return {
        success: true,
        data: buildDeployStatusPayload_({
          apiReady: false,
          canPublish: !!deploymentId && !!scriptId,
          hint: !deploymentId
            ? 'Deployment ID is missing. Paste the AKfycb… id from the web app URL, then Save ID.'
            : 'Could not resolve this script ID.'
        })
      };
    }

    const result = appsScriptApiRequest_('get', 'projects/' + encodeURIComponent(scriptId) + '/deployments/' + encodeURIComponent(deploymentId));
    if (result.code < 200 || result.code >= 300) {
      return {
        success: true,
        data: buildDeployStatusPayload_({
          apiReady: false,
          canPublish: true,
          hint: formatAppsScriptApiError_(result, 'Could not read the current deployment.')
        })
      };
    }

    const cfg = (result.json && result.json.deploymentConfig) ? result.json.deploymentConfig : {};
    const versionNumber = cfg.versionNumber != null ? Number(cfg.versionNumber) : null;
    return {
      success: true,
      data: buildDeployStatusPayload_({
        apiReady: true,
        canPublish: true,
        currentVersion: isNaN(versionNumber) ? null : versionNumber,
        currentDescription: String(cfg.description || '').trim(),
        hint: 'After a developer pushes code, click Publish latest code to update this same URL.'
      })
    };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
}

function api_saveWebAppDeploymentId(deploymentId) {
  try {
    const gate = requireOwnerForDeploy_();
    if (!gate.ok) return gate.response;
    const id = String(deploymentId || '').trim();
    if (!id) {
      return { success: false, error: 'Deployment ID is required.' };
    }
    if (id.indexOf('AKfycb') !== 0) {
      return {
        success: false,
        error: 'Deployment ID should look like AKfycb… (from the /exec URL after /macros/s/).'
      };
    }
    if (typeof upsertSettingKey_ !== 'function') {
      return { success: false, error: 'Could not save settings.' };
    }
    upsertSettingKey_('WEBAPP_DEPLOYMENT_ID', id);
    return {
      success: true,
      message: 'Deployment ID saved.',
      data: (api_getWebAppDeployStatus().data || buildDeployStatusPayload_({}))
    };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
}

function api_publishWebAppVersion(description) {
  try {
    const gate = requireOwnerForDeploy_();
    if (!gate.ok) return gate.response;

    const pendingAuthUrl = typeof getAuthorizationUrlIfNeeded_ === 'function' ? getAuthorizationUrlIfNeeded_() : '';
    if (pendingAuthUrl) {
      return {
        success: false,
        error: 'Additional Google permission is required to publish. Complete consent, then try again.',
        authorizationUrl: pendingAuthUrl
      };
    }

    const scriptId = getDeployScriptId_();
    const deploymentId = getConfiguredDeploymentId_();
    if (!scriptId) {
      return { success: false, error: 'Script ID is missing.' };
    }
    if (!deploymentId) {
      return {
        success: false,
        error: 'Deployment ID is missing. Paste it in Settings → Web app version, then Save ID.'
      };
    }

    const desc = String(description || '').trim() ||
      ('LSC ' + getDeployEnvLabel_() + ' · ' + new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC');

    const versionRes = appsScriptApiRequest_('post', 'projects/' + encodeURIComponent(scriptId) + '/versions', {
      description: desc
    });
    if (versionRes.code < 200 || versionRes.code >= 300) {
      const authUrl = typeof getAuthorizationUrlIfNeeded_ === 'function' ? getAuthorizationUrlIfNeeded_() : '';
      return {
        success: false,
        error: formatAppsScriptApiError_(versionRes, 'Could not create a new script version.'),
        authorizationUrl: authUrl || ''
      };
    }

    const versionNumber = versionRes.json && versionRes.json.versionNumber != null
      ? Number(versionRes.json.versionNumber)
      : NaN;
    if (isNaN(versionNumber)) {
      return { success: false, error: 'Version was created but no version number was returned.' };
    }

    const existing = appsScriptApiRequest_(
      'get',
      'projects/' + encodeURIComponent(scriptId) + '/deployments/' + encodeURIComponent(deploymentId)
    );
    if (existing.code < 200 || existing.code >= 300) {
      return {
        success: false,
        error: formatAppsScriptApiError_(existing, 'Could not read the existing web app deployment.')
      };
    }

    const prevCfg = (existing.json && existing.json.deploymentConfig) ? existing.json.deploymentConfig : {};
    const updateRes = appsScriptApiRequest_(
      'put',
      'projects/' + encodeURIComponent(scriptId) + '/deployments/' + encodeURIComponent(deploymentId),
      {
        deploymentConfig: {
          scriptId: scriptId,
          versionNumber: versionNumber,
          manifestFileName: String(prevCfg.manifestFileName || 'appsscript'),
          description: desc
        }
      }
    );
    if (updateRes.code < 200 || updateRes.code >= 300) {
      return {
        success: false,
        error: formatAppsScriptApiError_(updateRes, 'Version created, but updating the deployment failed.')
      };
    }

    const publisher = (gate.context && gate.context.email) || '';
    const publishedAt = new Date().toISOString();
    if (typeof upsertSettingKey_ === 'function') {
      upsertSettingKey_('WEBAPP_DEPLOYMENT_ID', deploymentId);
      upsertSettingKey_('WEBAPP_LAST_VERSION', String(versionNumber));
      upsertSettingKey_('WEBAPP_LAST_PUBLISHED_AT', publishedAt);
      if (publisher) upsertSettingKey_('WEBAPP_LAST_PUBLISHED_BY', publisher);
    }

    const status = api_getWebAppDeployStatus();
    return {
      success: true,
      message: 'Published version ' + versionNumber + ' to the stable web app URL.',
      data: (status && status.data) || buildDeployStatusPayload_({
        apiReady: true,
        canPublish: true,
        currentVersion: versionNumber,
        lastPublishedVersion: String(versionNumber),
        lastPublishedAt: publishedAt,
        lastPublishedBy: publisher
      })
    };
  } catch (error) {
    const authUrl = typeof getAuthorizationUrlIfNeeded_ === 'function' ? getAuthorizationUrlIfNeeded_() : '';
    return {
      success: false,
      error: error.message || String(error),
      authorizationUrl: authUrl || ''
    };
  }
}
