
// ============================================================================
// BACKEND GOOGLE APPS SCRIPT - v2.4.6 (STABLE VERSION)
// ============================================================================

/**
 * @OnlyCurrentDoc
 */

function checkAndSendReminders() {
  const lock = LockService.getScriptLock();
  let hasLock = false;
  try {
    // Tenta obter o lock por mais tempo para evitar colisões com salvamentos do App
    hasLock = lock.tryLock(15000);
    if (!hasLock) {
      console.warn("CheckReminders: Não foi possível obter o lock (timeout)");
      return;
    }
    
    const targetEmail = "breno.acst@gmail.com";
    const sheet = getOrCreateSheet("Agenda");
    const range = sheet.getDataRange();
    const data = range.getValues();
    const now = new Date();
    // Formato YYYY-MM-DD fixo para evitar problemas de fuso/localidade
    const todayStr = Utilities.formatDate(now, "GMT-3", "yyyy-MM-dd");
    
    if (data.length <= 1) return;

    let sheetUpdated = false;

    for (let i = 1; i < data.length; i++) {
      const jsonCol = data[i][2];
      if (!jsonCol) continue;

      try {
        let item = JSON.parse(jsonCol);
        if (item.status === 'Pending') {
          const dueDate = new Date(item.dueDate);
          
          // Verifica se já passou da data/hora original de vencimento
          if (now.getTime() >= dueDate.getTime()) {
            // Calcula minutos passados desde o início do dia para comparar apenas a HORA
            const scheduledMinutes = dueDate.getHours() * 60 + dueDate.getMinutes();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();

            // Só envia se a HORA atual for maior ou igual à HORA agendada
            if (currentMinutes >= scheduledMinutes) {
              // Usamos uma propriedade no próprio objeto JSON para rastrear o envio diário
              if (item.lastEmailSentDate !== todayStr) {
                const subject = "ALERTA DE LEMBRETE: " + item.title;
              const body = "Olá Breno,\n\nVocê tem um lembrete pendente na sua agenda do Tracker:\n\n" +
                           "TÍTULO: " + item.title + "\n" +
                           "DESCRIÇÃO: " + (item.description || "Sem descrição informada.") + "\n" +
                           "DATA PROGRAMADA: " + dueDate.toLocaleString('pt-BR') + "\n\n" +
                           "Este lembrete continuará sendo enviado diariamente até ser marcado como CONCLUÍDO no aplicativo.";

              try {
                MailApp.sendEmail({ to: targetEmail, subject: subject, body: body });
                
                // Marca como enviado hoje no próprio objeto
                item.lastEmailSentDate = todayStr;
                data[i][2] = JSON.stringify(item);
                sheetUpdated = true;
                
                console.log("E-mail enviado para: " + item.title);
              } catch (mailErr) {
                console.error("Erro ao enviar e-mail (MailApp): " + mailErr.toString());
              }
              }
            }
          }
        }
      } catch (e) {
        console.error("Erro processando linha " + (i + 1) + ": " + e.toString());
      }
    }

    // Só grava de volta se houve alteração (envio de e-mail)
    if (sheetUpdated) {
      sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
      SpreadsheetApp.flush();
    }
  } catch (e) {
    console.error("Erro crítico no checkAndSendReminders: " + e.toString());
  } finally {
    if (hasLock) {
      try {
        lock.releaseLock();
      } catch(f) {}
    }
  }
}

function doGet(e) {
  if (!e || !e.parameter) return response({success: false, message: "Acesso manual bloqueado. Use o App."});
  const action = e.parameter.action;
  
  if (action === 'GET_USERS') return getUsers();
  if (action === 'GET_CLIENTS') return getClients();
  if (action === 'GET_ASSEMBLERS') return getAssemblers();
  if (action === 'GET_MANIFESTS') return getManifests();
  if (action === 'GET_LOGO') return getLogoUrl();
  if (action === 'GET_AGENDA') return getAgenda(e.parameter.userId);
  if (action === 'GET_AGENDA_ISSUES') return getAgendaIssues(e.parameter.userId);
  if (action === 'GET_FILE_BASE64') return getFileBase64(e.parameter.fileId);
  if (action === 'GET_FLEET') return getFleet();
  if (action === 'GET_FURNITURE_ORDERS') return getFurnitureOrders();
  if (action === 'GET_SCORES') return getScores();
  
  return response({success: false, message: "Ação inválida"});
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const data = body.data;
    
    if (action === 'SAVE_USERS') return saveUsers(data);
    if (action === 'UPDATE_CLIENT') return saveClient(data);
    if (action === 'DELETE_CLIENT') return deleteClient(data);
    if (action === 'SAVE_ASSEMBLERS') return saveAssemblers(data);
    if (action === 'SAVE_MANIFESTS') return saveManifests(data);
    if (action === 'UPLOAD_FILE') return uploadFile(data);
    if (action === 'DELETE_FILE') return deleteDriveFile(data);
    if (action === 'SAVE_AGENDA') return saveAgenda(data.userId, data.list);
    if (action === 'SAVE_AGENDA_ISSUES') return saveAgendaIssues(data.userId, data.list);
    if (action === 'SAVE_FLEET') return saveFleet(data);
    if (action === 'SAVE_FURNITURE_ORDERS') return saveFurnitureOrders(data);
    if (action === 'SAVE_SCORES') return saveScores(data);
    
    return response({success: false, message: "Ação inválida"});
  } catch (error) {
    return response({success: false, message: error.toString()});
  }
}

function response(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function getFileBase64(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    return response({ success: true, data: "data:" + blob.getContentType() + ";base64," + Utilities.base64Encode(blob.getBytes()) });
  } catch (e) { return response({success: false, message: e.toString()}); }
}

function getLogoUrl() {
  const files = DriveApp.getFilesByName("Todeschini-transparent.png");
  if (files.hasNext()) {
    const file = files.next();
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return response({ success: true, url: "https://drive.google.com/uc?id=" + file.getId() });
  }
  return response({success: false, message: "Logo não encontrada."});
}

function getUsers() {
  const sheet = getOrCreateSheet("Users");
  const data = sheet.getDataRange().getValues();
  const users = data.slice(1).filter(r => r[0]).map(r => ({ id: r[0], username: r[1], password: r[2], role: r[3] }));
  return response({success: true, data: users});
}

function saveUsers(users) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getOrCreateSheet("Users");
    sheet.clearContents();
    sheet.appendRow(["ID", "Username", "Password", "Role"]);
    const rows = users.map(u => [u.id, u.username, u.password, u.role]);
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, 4).setValues(rows);
    SpreadsheetApp.flush();
    return response({success: true});
  } finally { lock.releaseLock(); }
}

function getClients() {
  const sheet = getOrCreateSheet("Clients");
  const data = sheet.getDataRange().getValues();
  const clients = data.slice(1).filter(r => r[1]).map(r => JSON.parse(r[1]));
  return response({success: true, data: clients});
}

function saveClient(clientData) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getOrCreateSheet("Clients");
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == clientData.id) { rowIndex = i + 1; break; }
    }
    const jsonStr = JSON.stringify(clientData);
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 2).setValue(jsonStr);
    } else {
      sheet.appendRow([clientData.id, jsonStr]);
    }
    SpreadsheetApp.flush();
    return response({success: true});
  } finally { lock.releaseLock(); }
}

function deleteClient(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getOrCreateSheet("Clients");
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == payload.id) { sheet.deleteRow(i + 1); break; }
    }
    SpreadsheetApp.flush();
    return response({success: true});
  } finally { lock.releaseLock(); }
}

function getAssemblers() {
  const sheet = getOrCreateSheet("Montadores");
  const data = sheet.getDataRange().getValues();
  const list = data.slice(1).filter(r => r[0]).map(r => ({ id: String(r[0]), name: String(r[1]), role: String(r[2] || '') }));
  return response({success: true, data: list});
}

function saveAssemblers(list) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getOrCreateSheet("Montadores");
    sheet.clearContents();
    sheet.appendRow(["ID", "Name", "Role"]);
    const rows = list.map(item => [item.id, item.name, item.role]);
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, 3).setValues(rows);
    SpreadsheetApp.flush();
    return response({success: true});
  } finally { lock.releaseLock(); }
}

function getManifests() {
  const sheet = getOrCreateSheet("Manifests");
  const data = sheet.getDataRange().getValues();
  const manifests = data.slice(1).filter(r => r[1]).map(r => JSON.parse(r[1]));
  return response({success: true, data: manifests});
}

function saveManifests(list) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getOrCreateSheet("Manifests");
    sheet.clearContents();
    sheet.appendRow(["ID", "DATA_JSON"]);
    const rows = list.map(m => [m.id, JSON.stringify(m)]);
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, 2).setValues(rows);
    SpreadsheetApp.flush();
    return response({success: true});
  } finally { lock.releaseLock(); }
}

function getFleet() {
  const vehicles = getOrCreateSheet("Vehicles").getDataRange().getValues().slice(1).filter(r => r[0]).map(r => ({ id: r[0], name: r[1], plate: r[2] }));
  const logs = getOrCreateSheet("FleetUsage").getDataRange().getValues().slice(1).filter(r => r[1]).map(r => JSON.parse(r[1]));
  return response({ success: true, vehicles, logs });
}

function saveFleet(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sV = getOrCreateSheet("Vehicles");
    sV.clearContents().appendRow(["ID", "Name", "Plate"]);
    const rV = data.vehicles.map(v => [v.id, v.name, v.plate]);
    if (rV.length > 0) sV.getRange(2, 1, rV.length, 3).setValues(rV);
    
    const sL = getOrCreateSheet("FleetUsage");
    sL.clearContents().appendRow(["ID", "DATA_JSON"]);
    const rL = data.logs.map(l => [l.id, JSON.stringify(l)]);
    if (rL.length > 0) sL.getRange(2, 1, rL.length, 2).setValues(rL);
    SpreadsheetApp.flush();
    return response({ success: true });
  } finally { lock.releaseLock(); }
}

function getFurnitureOrders() {
  const list = getOrCreateSheet("FurnitureOrders").getDataRange().getValues().slice(1).filter(r => r[1]).map(r => JSON.parse(r[1]));
  return response({success: true, data: list});
}

function saveFurnitureOrders(list) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getOrCreateSheet("FurnitureOrders");
    sheet.clearContents().appendRow(["ID", "DATA_JSON"]);
    const rows = list.map(item => [item.id, JSON.stringify(item)]);
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, 2).setValues(rows);
    SpreadsheetApp.flush();
    return response({success: true});
  } finally { lock.releaseLock(); }
}

function uploadFile(data) {
  try {
    const folders = DriveApp.getFoldersByName("AppMontagens_Uploads");
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("AppMontagens_Uploads");
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const blob = Utilities.newBlob(Utilities.base64Decode(data.base64Data.includes(',') ? data.base64Data.split(',')[1] : data.base64Data), data.mimeType || 'image/jpeg', data.fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return response({ success: true, url: "https://drive.google.com/uc?id=" + file.getId(), id: file.getId() });
  } catch (e) { return response({success: false, message: e.toString()}); }
}

function deleteDriveFile(data) {
  try {
    if (!data.fileId) return response({success: false, message: "ID do arquivo ausente"});
    const file = DriveApp.getFileById(data.fileId);
    file.setTrashed(true);
    return response({ success: true });
  } catch (e) {
    return response({success: false, message: e.toString()});
  }
}

function getAgenda(userId) {
  const data = getOrCreateSheet("Agenda").getDataRange().getValues();
  const items = data.slice(1).filter(r => r[0] == userId && r[2]).map(r => JSON.parse(r[2]));
  return response({success: true, data: items});
}

/**
 * SALVAMENTO ATÔMICO COM LOCKSERVICE: Previne duplicatas e erros de servidor.
 */
function saveAgenda(userId, list) {
  if (!userId) return response({success: false, message: "UserId ausente"});
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getOrCreateSheet("Agenda");
    const data = sheet.getDataRange().getValues();
    
    // Filtra fora todos os registros do usuário atual para substituição limpa
    const otherUsersData = data.filter((row, index) => index === 0 || row[0] != userId);
    const newRows = (list || []).map(item => [userId, item.id, JSON.stringify(item)]);
    const finalData = [...otherUsersData, ...newRows];

    sheet.clearContents();
    if (finalData.length > 0) {
      sheet.getRange(1, 1, finalData.length, 3).setValues(finalData);
    }
    SpreadsheetApp.flush();
    return response({success: true});
  } catch(e) {
    return response({success: false, message: e.toString()});
  } finally {
    lock.releaseLock();
  }
}

function getAgendaIssues(userId) {
  const data = getOrCreateSheet("AgendaIssues").getDataRange().getValues();
  const items = data.slice(1).filter(r => r[0] == userId && r[2]).map(r => JSON.parse(r[2]));
  return response({success: true, data: items});
}

function saveAgendaIssues(userId, list) {
  if (!userId) return response({success: false, message: "UserId ausente"});
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getOrCreateSheet("AgendaIssues");
    const data = sheet.getDataRange().getValues();
    
    const otherUsersData = data.filter((row, index) => index === 0 || row[0] != userId);
    const newRows = (list || []).map(item => [userId, item.id, JSON.stringify(item)]);
    const finalData = [...otherUsersData, ...newRows];

    sheet.clearContents();
    if (finalData.length > 0) {
      sheet.getRange(1, 1, finalData.length, 3).setValues(finalData);
    }
    SpreadsheetApp.flush();
    return response({success: true});
  } catch(e) {
    return response({success: false, message: e.toString()});
  } finally {
    lock.releaseLock();
  }
}

function getScores() {
  const sheet = getOrCreateSheet("Scores");
  const data = sheet.getDataRange().getValues();
  const list = data.slice(1).filter(r => r[1]).map(r => JSON.parse(r[1]));
  return response({success: true, data: list});
}

function saveScores(list) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getOrCreateSheet("Scores");
    sheet.clearContents();
    sheet.appendRow(["ID", "DATA_JSON"]);
    const rows = list.map(item => [item.id, JSON.stringify(item)]);
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, 2).setValues(rows);
    SpreadsheetApp.flush();
    return response({success: true});
  } finally { lock.releaseLock(); }
}
