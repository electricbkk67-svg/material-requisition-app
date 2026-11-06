/**
 * ====================================================================
 * ระบบเว็บแอปพลิเคชัน เบิกจ่ายพัสดุ (Material Requisition System)
 * Backend REST API สำหรับ Google Apps Script + รองรับ GitHub Pages
 * ====================================================================
 */

// ================= [ การตั้งค่าระบบ / CONFIGURATION ] =================
const CONFIG = {
  // ชื่อแผ่นงาน (Sheet Names)
  SHEET_INVENTORY: "พัสดุ",
  SHEET_TRANSACTIONS: "เบิกจ่าย",

  // ID ของโฟลเดอร์ Google Drive สำหรับจัดเก็บรูปภาพ
  FOLDER_ID_ITEM_IMAGES: "1GkMFsEsbajzD0x4FCy-Zak2FkoC0TPyl", // โฟลเดอร์ "รูปพัสดุ"
  FOLDER_ID_JOB_IMAGES: "1a2sjlmCoevkwnx_d4L32ByHpbKeIj7Ix",   // โฟลเดอร์ "รูปงาน"
};

/**
 * Handle GET Requests (เรียกข้อมูลพัสดุ, รหัสถัดไป, ประวัติ, ซิงค์รูป)
 */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";

  // ถ้าเปิดจาก Browser ตรงๆ โดยไม่มี action ให้แสดงหน้าเว็บ (กรณีเปิดใน Google Apps Script โดยตรง)
  if (!action) {
    try {
      const template = HtmlService.createTemplateFromFile("index");
      return template
        .evaluate()
        .setTitle("ระบบเบิกจ่ายพัสดุ")
        .addMetaTag("viewport", "width=device-width, initial-scale=1")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (err) {
      return jsonResponse({ status: "ok", message: "API Backend is running." });
    }
  }

  try {
    let result = null;

    if (action === "getInventory") {
      result = getInventory();
    } else if (action === "getNextItemId") {
      result = getNextItemId();
    } else if (action === "getHistory") {
      const limit = Number(e.parameter.limit) || 50;
      result = getRequisitionHistory(limit);
    } else if (action === "syncImages") {
      result = syncDriveImagesToSheet();
    } else {
      return jsonResponse({ error: "Invalid action" });
    }

    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ error: error.message });
  }
}

/**
 * Handle POST Requests (บันทึกเบิกจ่าย, เพิ่มพัสดุใหม่, แก้ไขข้อมูล/รูป)
 */
function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const action = payload.action || "";
    let response = { success: false, message: "Unknown action" };

    if (action === "submitRequisition") {
      response = submitRequisition(payload.data || payload);
    } else if (action === "addItem") {
      response = addNewItem(payload.data || payload);
    } else if (action === "updateItem") {
      response = updateItem(payload.data || payload);
    }

    return jsonResponse(response);
  } catch (error) {
    return jsonResponse({ success: false, message: "Server error: " + error.message });
  }
}

/**
 * ส่งคืน JSON ตอบกลับพร้อม Header
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ดึงข้อมูลพัสดุทั้งหมด (Inventory)
 */
function getInventory() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_INVENTORY);
  if (!sheet) throw new Error("ไม่พบชีท: " + CONFIG.SHEET_INVENTORY);

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const items = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row[0] && !row[1]) continue;

    const shouldHave = Number(row[7]) || 0; // ควรมี (เป้าหมายประจำปี/รอบ เพื่อดูยอดที่ต้องซื้อเพิ่ม)
    const received = Number(row[8]) || 0;   // รับเข้า
    const disbursed = Number(row[9]) || 0;  // เบิกออก
    const remaining = Number(row[10]) || 0; // คงเหลือ
    const needMore = shouldHave > remaining ? shouldHave - remaining : 0; // ควรเพิ่ม
    // เปอร์เซ็นต์คงเหลือ: คิดจาก คงเหลือ เทียบกับ ควรมี (เป้าหมาย)
    const percentRemaining = shouldHave > 0 ? Math.round((remaining / shouldHave) * 100) : (remaining > 0 ? 100 : 0);

    const item = {
      rowIndex: i + 1,
      id: String(row[0] || "").trim(),
      name: String(row[1] || "").trim(),
      category: String(row[2] || "").trim(),
      usageType: String(row[3] || "").trim(),
      details: String(row[4] || "").trim(),
      image: formatImageUrl(String(row[5] || "").trim()),
      location: String(row[6] || "").trim(),
      minStock: shouldHave,
      shouldHave: shouldHave,
      received: received,
      disbursed: disbursed,
      remaining: remaining,
      needMore: needMore,
      unit: String(row[12] || "").trim(),
      percentRemaining: percentRemaining
    };

    items.push(item);
  }

  return items;
}

/**
 * สร้างรหัสพัสดุถัดไปอัตโนมัติ (เช่น พัสดุ-0096)
 */
function getNextItemId() {
  try {
    const items = getInventory();
    let maxNum = 0;
    const regex = /พัสดุ-(\d+)/;

    items.forEach(item => {
      const match = item.id.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });

    const nextNum = maxNum + 1;
    const padded = String(nextNum).padStart(4, "0");
    return "พัสดุ-" + padded;
  } catch (err) {
    return "พัสดุ-0001";
  }
}

/**
 * เพิ่มพัสดุใหม่ (Add New Item)
 */
function addNewItem(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_INVENTORY);
    if (!sheet) throw new Error("ไม่พบชีท: " + CONFIG.SHEET_INVENTORY);

    let imageUrl = "";
    if (data.imageBase64 && data.imageName) {
      imageUrl = uploadFileToDrive(
        data.imageBase64,
        data.imageName,
        CONFIG.FOLDER_ID_ITEM_IMAGES,
        data.id,
        "รูป"
      );
    }

    const shouldHave = Number(data.shouldHave || data.minStock) || 0;
    const received = Number(data.received) || 0;
    const disbursed = 0;
    const remaining = received - disbursed;
    const needMore = shouldHave > remaining ? shouldHave - remaining : 0;
    const percent = shouldHave > 0 ? (remaining / shouldHave) : 0;

    const newRow = [
      data.id || getNextItemId(),
      data.name || "",
      data.category || "",
      data.usageType || "เบิกขาด",
      data.details || "",
      imageUrl,
      data.location || "",
      shouldHave,
      received,
      disbursed,
      remaining,
      needMore,
      data.unit || "ชิ้น",
      percent
    ];

    sheet.appendRow(newRow);
    return { success: true, message: "เพิ่มพัสดุใหม่เรียบร้อยแล้ว", id: data.id };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * แก้ไขข้อมูลพัสดุ / เปลี่ยนรูปภาพ (Update Item)
 */
function updateItem(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_INVENTORY);
    if (!sheet) throw new Error("ไม่พบชีท: " + CONFIG.SHEET_INVENTORY);

    const values = sheet.getDataRange().getValues();
    let targetRow = -1;

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim() === String(data.id).trim()) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow === -1) {
      throw new Error("ไม่พบพัสดุรหัส: " + data.id);
    }

    let imageUrl = data.currentImage || "";
    if (data.imageBase64 && data.imageName) {
      imageUrl = uploadFileToDrive(
        data.imageBase64,
        data.imageName,
        CONFIG.FOLDER_ID_ITEM_IMAGES,
        data.id,
        "รูป"
      );
    }

    const currentDisbursed = Number(values[targetRow - 1][9]) || 0;
    const shouldHave = Number(data.shouldHave || data.minStock) || 0;
    const received = Number(data.received) || 0;
    const remaining = received - currentDisbursed;
    const needMore = shouldHave > remaining ? shouldHave - remaining : 0;
    const percent = shouldHave > 0 ? (remaining / shouldHave) : 0;

    // อัปเดตชีท
    sheet.getRange(targetRow, 2).setValue(data.name || "");
    sheet.getRange(targetRow, 3).setValue(data.category || "");
    sheet.getRange(targetRow, 4).setValue(data.usageType || "เบิกขาด");
    sheet.getRange(targetRow, 5).setValue(data.details || "");
    if (imageUrl) {
      sheet.getRange(targetRow, 6).setValue(imageUrl);
    }
    sheet.getRange(targetRow, 7).setValue(data.location || "");
    sheet.getRange(targetRow, 8).setValue(shouldHave);
    sheet.getRange(targetRow, 9).setValue(received);
    sheet.getRange(targetRow, 11).setValue(remaining);
    sheet.getRange(targetRow, 12).setValue(needMore);
    sheet.getRange(targetRow, 13).setValue(data.unit || "");
    sheet.getRange(targetRow, 14).setValue(percent);

    return { success: true, message: "อัปเดตข้อมูลพัสดุเรียบร้อยแล้ว" };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * บันทึกการเบิกจ่ายพัสดุ (Submit Requisition)
 */
function submitRequisition(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetInv = ss.getSheetByName(CONFIG.SHEET_INVENTORY);
    const sheetReq = ss.getSheetByName(CONFIG.SHEET_TRANSACTIONS);

    if (!sheetInv || !sheetReq) throw new Error("ไม่พบชีทพัสดุหรือชีทเบิกจ่าย");

    const invValues = sheetInv.getDataRange().getValues();
    let itemRow = -1;
    let currentItem = null;

    for (let i = 1; i < invValues.length; i++) {
      if (String(invValues[i][0]).trim() === String(data.itemId).trim()) {
        itemRow = i + 1;
        currentItem = {
          name: invValues[i][1],
          image: invValues[i][5],
          location: invValues[i][6],
          minStock: Number(invValues[i][7]) || 0,
          received: Number(invValues[i][8]) || 0,
          disbursed: Number(invValues[i][9]) || 0,
          remaining: Number(invValues[i][10]) || 0,
          unit: invValues[i][12] || ""
        };
        break;
      }
    }

    if (!currentItem) {
      throw new Error("ไม่พบข้อมูลพัสดุรหัส: " + data.itemId);
    }

    const qtyToDisburse = Number(data.quantity) || 0;
    if (qtyToDisburse <= 0) {
      throw new Error("จำนวนที่เบิกต้องมากกว่า 0");
    }

    if (qtyToDisburse > currentItem.remaining) {
      throw new Error(
        "พัสดุคงเหลือไม่พอสำหรับการเบิก! คงเหลือปัจจุบัน: " +
        currentItem.remaining + " " + currentItem.unit
      );
    }

    // รูปงาน
    let jobImageUrl = "";
    if (data.jobImageBase64 && data.jobImageName) {
      jobImageUrl = uploadFileToDrive(
        data.jobImageBase64,
        data.jobImageName,
        CONFIG.FOLDER_ID_JOB_IMAGES,
        data.jobId || "งาน",
        "รูปงาน"
      );
    }

    // รูปพัสดุขณะเบิก
    let requisitionItemImageUrl = currentItem.image;
    if (data.reqImageBase64 && data.reqImageName) {
      requisitionItemImageUrl = uploadFileToDrive(
        data.reqImageBase64,
        data.reqImageName,
        CONFIG.FOLDER_ID_ITEM_IMAGES,
        data.itemId,
        "เบิก"
      );
    }

    const reqId = "DISB-" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd-HHmmss");
    const timestampStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd HH:mm:ss");

    const newDisbursed = currentItem.disbursed + qtyToDisburse;
    const newRemaining = currentItem.received - newDisbursed;
    const shouldHave = currentItem.minStock; // ควรมี (เป้าหมาย)
    const newNeedMore = shouldHave > newRemaining ? shouldHave - newRemaining : 0;
    const newPercent = shouldHave > 0 ? (newRemaining / shouldHave) : 0;

    const newReqRow = [
      data.jobId || "",
      reqId,
      data.itemId,
      data.locationId || "",
      data.date || Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd"),
      data.jobName || "",
      data.location || currentItem.location,
      jobImageUrl,
      currentItem.name,
      requisitionItemImageUrl,
      data.requester || "",
      data.status || "เบิกจ่ายสำเร็จ",
      timestampStr,
      shouldHave,
      currentItem.received,
      qtyToDisburse,
      newRemaining,
      newNeedMore,
      data.workResult || ""
    ];

    sheetReq.appendRow(newReqRow);

    sheetInv.getRange(itemRow, 10).setValue(newDisbursed);
    sheetInv.getRange(itemRow, 11).setValue(newRemaining);
    sheetInv.getRange(itemRow, 12).setValue(newNeedMore);
    sheetInv.getRange(itemRow, 14).setValue(newPercent);

    return {
      success: true,
      message: "บันทึกการเบิกจ่ายสำเร็จ! ตัดยอดสต็อกเรียบร้อย",
      reqId: reqId,
      remaining: newRemaining
    };
  } catch (error) {
    return { success: false, message: error.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ดึงประวัติการเบิกจ่าย
 */
function getRequisitionHistory(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_TRANSACTIONS);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const maxItems = limit || 50;
  const list = [];

  for (let i = values.length - 1; i >= 1; i--) {
    const row = values[i];
    if (!row[1]) continue;

    list.push({
      jobId: row[0],
      disbId: row[1],
      itemId: row[2],
      date: formatDateDisplay(row[4]),
      jobName: row[5],
      location: row[6],
      jobImage: formatImageUrl(row[7]),
      itemName: row[8],
      itemImage: formatImageUrl(row[9]),
      requester: row[10],
      status: row[11],
      timestamp: row[12],
      quantity: row[15],
      workResult: row[18]
    });

    if (list.length >= maxItems) break;
  }

  return list;
}

/**
 * อัปโหลดไฟล์ภาพ Base64 ไปยัง Google Drive
 */
function uploadFileToDrive(base64Data, originalName, folderId, idPrefix, typeLabel) {
  try {
    if (!folderId || folderId.includes("PUT_YOUR")) {
      return "";
    }

    const folder = DriveApp.getFolderById(folderId);
    const splitData = base64Data.split(",");
    const contentType = splitData[0].match(/:(.*?);/)[1];
    const decodedBytes = Utilities.base64Decode(splitData[1]);

    const timeStr = Utilities.formatDate(new Date(), "GMT+7", "HHmmss");
    let ext = "jpg";
    if (originalName && originalName.lastIndexOf(".") !== -1) {
      ext = originalName.substring(originalName.lastIndexOf(".") + 1).toLowerCase();
    }

    const fileName = `${idPrefix}.${typeLabel}.${timeStr}.${ext}`;
    const blob = Utilities.newBlob(decodedBytes, contentType, fileName);
    const file = folder.createFile(blob);

    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    Logger.log("Error uploading to Drive: " + err.message);
    return "";
  }
}

/**
 * ปรับ URL Google Drive ให้โหลดตรงเสถียร 100%
 */
function formatImageUrl(url) {
  if (!url) return "";
  const match = url.match(/[-\w]{25,}/);
  if (match) {
    return "https://lh3.googleusercontent.com/d/" + match[0];
  }
  return url;
}

function formatDateDisplay(d) {
  if (!d) return "";
  if (d instanceof Date) {
    return Utilities.formatDate(d, "GMT+7", "dd/MM/yyyy");
  }
  return String(d);
}

/**
 * ซิงค์รูปภาพเดิม 95+ รูป
 */
function syncDriveImagesToSheet() {
  try {
    if (!CONFIG.FOLDER_ID_ITEM_IMAGES || CONFIG.FOLDER_ID_ITEM_IMAGES.includes("PUT_YOUR")) {
      return "กรุณาระบุ CONFIG.FOLDER_ID_ITEM_IMAGES ก่อนรัน";
    }

    const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID_ITEM_IMAGES);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const files = folder.getFiles();
    const imageMap = {};

    while (files.hasNext()) {
      const file = files.next();
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const name = file.getName();
      const match = name.match(/(พัสดุ-\d+)/);
      if (match) {
        const itemId = match[1];
        imageMap[itemId] = file.getUrl();
      }
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_INVENTORY);
    const values = sheet.getDataRange().getValues();
    let updatedCount = 0;

    for (let i = 1; i < values.length; i++) {
      const itemId = String(values[i][0]).trim();
      if (imageMap[itemId]) {
        sheet.getRange(i + 1, 6).setValue(imageMap[itemId]);
        updatedCount++;
      }
    }

    return `ซิงค์รูปภาพสำเร็จทั้งหมด ${updatedCount} รายการ!`;
  } catch (err) {
    return "เกิดข้อผิดพลาดในการซิงค์รูป: " + err.message;
  }
}
