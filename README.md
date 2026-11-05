# <img src="icon.svg" width="48" height="48" alt="Logo" style="vertical-align: middle; margin-right: 8px;"> ระบบเว็บแอปพลิเคชันเบิกจ่ายพัสดุ (Material Requisition Web App)

<p align="left">
  <img src="https://img.shields.io/badge/Google%20Apps%20Script-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Google Apps Script">
  <img src="https://img.shields.io/badge/Google%20Sheets-34A853?style=for-the-badge&logo=googlesheets&logoColor=white" alt="Google Sheets">
  <img src="https://img.shields.io/badge/Google%20Drive-FBBC05?style=for-the-badge&logo=googledrive&logoColor=white" alt="Google Drive">
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/SweetAlert2-8549BA?style=for-the-badge&logo=sweetalert2&logoColor=white" alt="SweetAlert2">
</p>

เว็บแอปพลิเคชันสำหรับเบิกจ่ายพัสดุ จัดการคลังอุปกรณ์ และบันทึกภาพถ่ายการปฏิบัติงาน พัฒนาด้วย **Google Apps Script (HTML / JavaScript Web App)** เชื่อมต่อฐานข้อมูล **Google Sheets** และจัดเก็บรูปภาพใน **Google Drive** โดยตรง ใช้งานได้ทั้งบนคอมพิวเตอร์และโทรศัพท์มือถือ

---

## 🌟 จุดเด่นและฟีเจอร์หลัก

1. **ระบบเบิกจ่ายพัสดุ (Searchable Requisition Form):**
   - พิมพ์ค้นหาชื่อหรือรหัสพัสดุแบบ Real-time พร้อมแสดงรูปภาพและจำนวนสต็อกคงเหลือ
   - ป้องกันการเบิกเกินจำนวนที่มีอยู่ในคลัง
   - รองรับการถ่ายรูปงาน / รูปพัสดุขณะเบิกจากกล้องมือถือ อัปโหลดตรงเข้า Google Drive
   - ตัดสต็อกในชีท "พัสดุ" และบันทึกประวัติลงชีท "เบิกจ่าย" อัตโนมัติ

2. **ระบบจัดการคลังพัสดุ (Inventory Management):**
   - ดูรายการพัสดุทั้งหมดในรูปแบบการ์ด พร้อมสถานะ (พร้อมเบิก / ใกล้หมด / หมดสต็อก)
   - ค้นหาตามชื่อ รหัส หรือหมวดหมู่ได้สะดวกรวดเร็ว
   - มีระบบแจ้งเตือนพัสดุใกล้หมดสต็อก

3. **เพิ่มพัสดุใหม่ & แก้ไขรูปภาพ (CRUD & Image Upload):**
   - รันรหัสพัสดุถัดไปอัตโนมัติ (เช่น `พัสดุ-0096`)
   - ถ่ายรูป/อัปโหลดรูปพัสดุใหม่ ระบบจะตั้งชื่อไฟล์ตามแบบแผน `[รหัสพัสดุ].รูป.[เวลา].jpg` ลงโฟลเดอร์ Google Drive ทันที
   - สามารถแก้ไขข้อมูลพัสดุ และอัปโหลดเปลี่ยนรูปภาพใหม่ได้ตลอดเวลา

4. **[ฟังก์ชันพิเศษ] ซิงค์รูปภาพเดิม 95+ รายการ:**
   - มีฟังก์ชัน `syncDriveImagesToSheet()` ใน `Code.gs` สแกนรูปภาพเดิมที่ตั้งชื่อตามรหัสพัสดุในโฟลเดอร์ Drive แล้วหยอด URL เข้าชีทให้ครบทั้งหมดในคลิกเดียว

---

## 📁 โครงสร้างโปรเจกต์

```text
├── Code.gs         # Backend Google Apps Script (จัดการชีท, ขับเคลื่อน Drive, ตัดสต็อก)
├── Index.html      # Frontend Web App (Tailwind CSS, SweetAlert2, Mobile-Responsive)
├── icon.svg        # ไอคอนประจำเว็บแอปและโลโก้โปรเจกต์
├── .gitignore      # ไฟล์ละเว้นไฟล์ชั่วคราวและไฟล์รูปดาวน์โหลด
└── README.md       # คู่มือการติดตั้งและใช้งาน
```

---

## 🛠️ ขั้นตอนการติดตั้งใช้งานใน Google Sheets

### ขั้นตอนที่ 1: เปิด Google Apps Script
1. เปิดไฟล์ **Google Sheets** (เบิกจ่ายพัสดุ) ของคุณบนเบราว์เซอร์
2. ไปที่เมนู **ส่วนขยาย (Extensions)** -> **Apps Script**

### ขั้นตอนที่ 2: วางโค้ดลงใน Apps Script
1. ที่ไฟล์ `Code.gs` เดิม ให้ลบโค้ดเดิมทั้งหมด แล้วคัดลอกโค้ดจากไฟล์ [`Code.gs`](./Code.gs) ไปวาง
2. กดปุ่ม **`+` (เพิ่มไฟล์)** เลือก **HTML** ตั้งชื่อไฟล์ว่า `Index`
3. คัดลอกโค้ดจากไฟล์ [`Index.html`](./Index.html) ไปวางในไฟล์ `Index.html`

### ขั้นตอนที่ 3: ระบุ ID โฟลเดอร์ Google Drive ใน `Code.gs`
เปิดไฟล์ `Code.gs` แล้วแก้ไขบรรทัดที่ 16 และ 17:
```javascript
const CONFIG = {
  SHEET_INVENTORY: "พัสดุ",
  SHEET_TRANSACTIONS: "เบิกจ่าย",

  FOLDER_ID_ITEM_IMAGES: "นำ Folder ID ของโฟลเดอร์รูปพัสดุมาวางที่นี่",
  FOLDER_ID_JOB_IMAGES: "นำ Folder ID ของโฟลเดอร์รูปงานมาวางที่นี่",
};
```
*(วิธีดู Folder ID: เปิดโฟลเดอร์ใน Google Drive สังเกตรหัสหลัง `.../folders/1a2b3c4d5e...`)*

### ขั้นตอนที่ 4: ซิงค์รูปภาพเดิมทั้งหมด (ทำครั้งแรก)
- ที่แถบเมนูด้านบนของ Apps Script เลือกฟังก์ชัน `syncDriveImagesToSheet` แล้วกด **"เรียกใช้ (Run)"**
- กดยอมรับสิทธิ์การเข้าถึง (Authorize Access)
- ระบบจะนำลิงก์รูปของพัสดุเดิมทั้งหมด (เช่น `พัสดุ-0001.รูป...jpg`) มาใส่ในคอลัมน์ "รูป" ของชีท "พัสดุ" ให้ทันที!

### ขั้นตอนที่ 5: เผยแพร่เว็บแอป (Deploy Web App)
1. กดปุ่มสีน้ำเงิน **"ทำให้ใช้งานได้ (Deploy)"** ด้านบนขวา -> เลือก **"การทำให้ใช้งานได้รายการใหม่ (New deployment)"**
2. คลิกรูปเฟืองด้านซ้าย เลือกประเภท **"เว็บแอป (Web app)"**
3. ตั้งค่า:
   - **คำอธิบาย:** Web App เบิกจ่ายพัสดุ
   - **ดำเนินการในฐานะ (Execute as):** ฉัน (Me)
   - **ผู้มีสิทธิ์เข้าถึง (Who has access):** ทุกคน (Anyone)
4. กด **"ทำให้ใช้งานได้ (Deploy)"** จะได้รับลิงก์ URL เว็บแอปสำหรับเปิดใช้งานทั้งบนมือถือและคอมพิวเตอร์!

---

## 🐙 วิธีนำขึ้น GitHub (Git Commands)

เปิด PowerShell หรือ Terminal ในโฟลเดอร์นี้ แล้วรันคำสั่งตามลำดับ:

```bash
# 1. กำหนดค่าเริ่มต้นให้กับ Git
git init

# 2. เพิ่มไฟล์ทั้งหมดเข้าสู่ Staging
git add .

# 3. Commit บันทึกเวอร์ชัน
git commit -m "feat: ระบบเว็บแอปพลิเคชันเบิกจ่ายพัสดุพร้อมไอคอนและระบบพิมพ์ค้นหา"

# 4. ตั้งชื่อ Branch หลักเป็น main
git branch -M main

# 5. เชื่อมต่อกับ Repository บน GitHub ของคุณ (สร้าง repo เปล่าบน GitHub ก่อน)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git

# 6. Push ไฟล์ทั้งหมดขึ้น GitHub
git push -u origin main
```
