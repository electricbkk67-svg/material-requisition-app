/**
 * ====================================================================
 * ระบบเว็บแอปพลิเคชัน เบิกจ่ายพัสดุ (Material Requisition System)
 * พัฒนาด้วย Google Apps Script (HTML / JavaScript Web App)
 * ====================================================================
 */

// ================= [ การตั้งค่าระบบ / CONFIGURATION ] =================
const CONFIG = {
  // ชื่อแผ่นงาน (Sheet Names)
  SHEET_INVENTORY: "พัสดุ",
  SHEET_TRANSACTIONS: "เบิกจ่าย",

  // ID ของโฟลเดอร์ Google Drive สำหรับจัดเก็บรูปภาพ
  // *** กรุณานำ Folder ID จาก Google Drive มาใส่ในเครื่องหมายคำพูดด้านล่าง ***
  FOLDER_ID_ITEM_IMAGES: "PUT_YOUR_ITEM_IMAGE_FOLDER_ID_HERE", // โฟลเดอร์ "รูปพัสดุ"
  FOLDER_ID_JOB_IMAGES: "PUT_YOUR_JOB_IMAGE_FOLDER_ID_HERE",   // โฟลเดอร์ "รูปงาน"
};

/**
 * ฟังก์ชันเริ่มต้นสำหรับโหลดหน้า Web App
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile("Index");
  return template
    .evaluate()
    .setTitle("ระบบเบิกจ่ายพัสดุ")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * ดึงข้อมูลพัสดุทั้งหมด (Inventory)
 */
function getInventory() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_INVENTORY);
    if (!sheet) throw new Error("ไม่พบชีท: " + CONFIG.SHEET_INVENTORY);

    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    const headers = values[0].map(h => String(h).trim());
    const items = [];

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row[0] && !row[1]) continue; // ข้ามแถวว่าง

      const item = {
        rowIndex: i + 1,
        id: String(row[0] || "").trim(),
        name: String(row[1] || "").trim(),
        category: String(row[2] || "").trim(),
        usageType: String(row[3] || "").trim(),
        details: String(row[4] || "").trim(),
        image: formatImageUrl(String(row[5] || "").trim()),
        location: String(row[6] || "").trim(),
        minStock: Number(row[7]) || 0,
        received: Number(row[8]) || 0,
        disbursed: Number(row[9]) || 0,
        remaining: Number(row[10]) || 0,
        needMore: Number(row[11]) || 0,
        unit: String(row[12] || "").trim(),
        percentRemaining: row[13] !== undefined ? row[13] : 0
      };

      items.push(item);
    }

    return items;
  } catch (error) {
    throw new Error("เกิดข้อผิดพลาดในการโหลดข้อมูลพัสดุ: " + error.message);
  }
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

    const minStock = Number(data.minStock) || 0;
    const received = Number(data.received) || 0;
    const disbursed = 0;
    const remaining = received - disbursed;
    const needMore = remaining < minStock ? minStock - remaining : 0;
    const percent = minStock > 0 ? (remaining / minStock) * 100 : (remaining > 0 ? 100 : 0);

    const newRow = [
      data.id || getNextItemId(),
      data.name || "",
      data.category || "",
      data.usageType || "เบิกขาด",
      data.details || "",
      imageUrl,
      data.location || "",
      minStock,
      received,
      disbursed,
      remaining,
      needMore,
      data.unit || "ชิ้น",
      percent / 100 // เก็บเป็นเลขทศนิยมสำหรับ Google Sheet % format
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
    const minStock = Number(data.minStock) || 0;
    const received = Number(data.received) || 0;
    const remaining = received - currentDisbursed;
    const needMore = remaining < minStock ? minStock - remaining : 0;
    const percent = minStock > 0 ? (remaining / minStock) * 100 : (remaining > 0 ? 100 : 0);

    // อัปเดตแถว
    sheet.getRange(targetRow, 2).setValue(data.name || "");
    sheet.getRange(targetRow, 3).setValue(data.category || "");
    sheet.getRange(targetRow, 4).setValue(data.usageType || "เบิกขาด");
    sheet.getRange(targetRow, 5).setValue(data.details || "");
    if (imageUrl) {
      sheet.getRange(targetRow, 6).setValue(imageUrl);
    }
    sheet.getRange(targetRow, 7).setValue(data.location || "");
    sheet.getRange(targetRow, 8).setValue(minStock);
    sheet.getRange(targetRow, 9).setValue(received);
    // row 10 (disbursed) คงเดิม
    sheet.getRange(targetRow, 11).setValue(remaining);
    sheet.getRange(targetRow, 12).setValue(needMore);
    sheet.getRange(targetRow, 13).setValue(data.unit || "");
    sheet.getRange(targetRow, 14).setValue(percent / 100);

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
    lock.waitLock(15000); // รอ Lock 15 วินาที เพื่อป้องกันคนเบิกพร้อมกันสต็อกคลาดเคลื่อน

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetInv = ss.getSheetByName(CONFIG.SHEET_INVENTORY);
    const sheetReq = ss.getSheetByName(CONFIG.SHEET_TRANSACTIONS);

    if (!sheetInv || !sheetReq) throw new Error("ไม่พบชีทพัสดุหรือชีทเบิกจ่าย");

    // 1. ตรวจสอบสต็อกในชีทพัสดุ
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

    // 2. จัดการอัปโหลดรูปงาน / รูปพัสดุ
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

    // 3. รัน ID การเบิกจ่ายอัตโนมัติ
    const reqId = "DISB-" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd-HHmmss");
    const timestampStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd HH:mm:ss");

    // คำนวณสต็อกหลังเบิก
    const newDisbursed = currentItem.disbursed + qtyToDisburse;
    const newRemaining = currentItem.received - newDisbursed;
    const newNeedMore = newRemaining < currentItem.minStock ? currentItem.minStock - newRemaining : 0;
    const newPercent = currentItem.minStock > 0 ? (newRemaining / currentItem.minStock) * 100 : 0;

    // 4. บันทึกลงชีท "เบิกจ่าย" (คอลัมน์ A ถึง S)
    const newReqRow = [
      data.jobId || "",                  // A: งาน ID
      reqId,                             // B: เบิกจ่าย ID
      data.itemId,                       // C: พัสดุ ID
      data.locationId || "",             // D: สถานที่ ID
      data.date || Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd"), // E: วันที่
      data.jobName || "",                // F: งานวันนี้
      data.location || currentItem.location, // G: สถานที่
      jobImageUrl,                       // H: รูปงาน
      currentItem.name,                  // I: รายการพัสดุ
      requisitionItemImageUrl,           // J: รูปพัสดุ
      data.requester || "",              // K: ผู้เบิก
      data.status || "เบิกจ่ายสำเร็จ",       // L: สถานะการเบิก
      timestampStr,                      // M: เวลาที่ทำรายการ (Timestamp)
      currentItem.minStock,              // N: ควรมี
      currentItem.received,              // O: รับเข้า
      qtyToDisburse,                     // P: เบิกออก
      newRemaining,                      // Q: คงเหลือ
      newNeedMore,                       // R: ควรเพิ่ม
      data.workResult || ""              // S: ผลการปฏิบัติงาน
    ];

    sheetReq.appendRow(newReqRow);

    // 5. ตัดสต็อกในชีท "พัสดุ"
    sheetInv.getRange(itemRow, 10).setValue(newDisbursed); // H: เบิกออก
    sheetInv.getRange(itemRow, 11).setValue(newRemaining); // I: คงเหลือ
    sheetInv.getRange(itemRow, 12).setValue(newNeedMore);  // J: ควรเพิ่ม
    sheetInv.getRange(itemRow, 14).setValue(newPercent / 100);

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
 * ดึงประวัติการเบิกจ่าย (Transactions History)
 */
function getRequisitionHistory(limit) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_TRANSACTIONS);
    if (!sheet) return [];

    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    const maxItems = limit || 50;
    const list = [];

    // วนจากล่างขึ้นบนเพื่อเอาแถวล่าสุดก่อน
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
  } catch (error) {
    throw new Error("เกิดข้อผิดพลาดในการโหลดประวัติ: " + error.message);
  }
}

/**
 * ฟังก์ชันผู้ช่วย: อัปโหลดไฟล์ภาพ Base64 ไปยัง Google Drive
 * ตั้งชื่อไฟล์ตามแบบแผน: [รหัส].รูป.[HHmmss].jpg
 */
function uploadFileToDrive(base64Data, originalName, folderId, idPrefix, typeLabel) {
  try {
    if (!folderId || folderId.includes("PUT_YOUR")) {
      return ""; // ยังไม่ได้ตั้งค่า Folder ID
    }

    const folder = DriveApp.getFolderById(folderId);
    const splitData = base64Data.split(",");
    const contentType = splitData[0].match(/:(.*?);/)[1];
    const decodedBytes = Utilities.base64Decode(splitData[1]);

    // สร้างชื่อไฟล์ตามแพทเทิร์น: พัสดุ-0001.รูป.121323.jpg
    const timeStr = Utilities.formatDate(new Date(), "GMT+7", "HHmmss");
    let ext = "jpg";
    if (originalName && originalName.lastIndexOf(".") !== -1) {
      ext = originalName.substring(originalName.lastIndexOf(".") + 1).toLowerCase();
    }

    const fileName = `${idPrefix}.${typeLabel}.${timeStr}.${ext}`;
    const blob = Utilities.newBlob(decodedBytes, contentType, fileName);
    const file = folder.createFile(blob);

    // เปิดสิทธิ์ให้อ่านรูปได้
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // ส่งคืน Direct View Link ของ Google Drive
    return file.getUrl();
  } catch (err) {
    Logger.log("Error uploading to Drive: " + err.message);
    return "";
  }
}

/**
 * ปรับ URL ของ Google Drive ให้แสดงผลเป็นภาพ <img> ได้อย่างเสถียร 100%
 * รองรับทั้งรูปแบบ drive.google.com และ lh3.googleusercontent.com
 */
function formatImageUrl(url) {
  if (!url) return "";
  // ดึง File ID จาก Google Drive URL
  const match = url.match(/[-\w]{25,}/);
  if (match) {
    const fileId = match[0];
    // ใช้ lh3.googleusercontent.com หรือ thumbnail API ซึ่งโหลดเร็วและไม่โดนเบราว์เซอร์บล็อก
    return "https://lh3.googleusercontent.com/d/" + fileId;
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
 * [ฟังก์ชันพิเศษ] ซิงค์รูปภาพเดิมในโฟลเดอร์ Drive "รูปพัสดุ" เข้าสู่ชีทพัสดุอัตโนมัติ!
 * กวาดหาไฟล์ภาพที่มีชื่อตรงกับรหัสพัสดุ เช่น "พัสดุ-0001.รูป.*" แล้วนำ URL มาหยอดใส่ชีทให้ทันที
 */
function syncDriveImagesToSheet() {
  try {
    if (!CONFIG.FOLDER_ID_ITEM_IMAGES || CONFIG.FOLDER_ID_ITEM_IMAGES.includes("PUT_YOUR")) {
      return "กรุณาระบุ CONFIG.FOLDER_ID_ITEM_IMAGES ให้ถูกต้องก่อนรัน";
    }

    const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID_ITEM_IMAGES);
    const files = folder.getFiles();
    const imageMap = {};

    while (files.hasNext()) {
      const file = files.next();
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const name = file.getName();
      // ค้นหารหัสพัสดุจากชื่อไฟล์ เช่น พัสดุ-0001
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
        // คอลัมน์ที่ 6 คือ คอลัมน์ F (รูป)
        sheet.getRange(i + 1, 6).setValue(imageMap[itemId]);
        updatedCount++;
      }
    }

    return `ซิงค์รูปภาพสำเร็จทั้งหมด ${updatedCount} รายการ!`;
  } catch (err) {
    return "เกิดข้อผิดพลาดในการซิงค์รูป: " + err.message;
  }
}

