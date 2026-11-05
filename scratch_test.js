
    // ==========================================
    // API Configuration (สำหรับรันบน GitHub Pages)
    // ==========================================
    // คุณสามารถใส่ Web App URL เริ่มต้นตรงนี้ หรือกดรูปเฟืองบนหน้าเว็บเพื่อกรอกได้ครับ
    const DEFAULT_API_URL = ""; 
    let API_URL = localStorage.getItem("APP_API_URL") || DEFAULT_API_URL;
    const isAppsScriptEnv = typeof google !== "undefined" && google.script && google.script.run;

    // ตรวจสอบและตั้งค่า API URL สำหรับ GitHub Pages
    async function checkApiConfig() {
      if (isAppsScriptEnv) return true;
      if (!API_URL || API_URL.trim() === "") {
        const { value: url } = await Swal.fire({
          title: 'ตั้งค่าการเชื่อมต่อ API',
          text: 'กรุณากรอก Web App URL ของ Google Apps Script ที่ได้จากการ Deploy:',
          input: 'text',
          inputPlaceholder: 'https://script.google.com/macros/s/.../exec',
          allowOutsideClick: false,
          showCancelButton: false,
          confirmButtonColor: '#059669',
          confirmButtonText: 'บันทึกและเชื่อมต่อ',
          inputValidator: (value) => {
            if (!value || !value.startsWith('https://script.google.com/macros/s/')) {
              return 'กรุณากรอก Google Apps Script Web App URL ที่ถูกต้อง!';
            }
          }
        });

        if (url) {
          API_URL = url.trim();
          localStorage.setItem("APP_API_URL", API_URL);
          return true;
        }
        return false;
      }
      return true;
    }

    // Modal แก้ไข URL เชื่อมต่อ
    async function openApiConfigModal() {
      const { value: url } = await Swal.fire({
        title: 'ตั้งค่า Web App API URL',
        text: 'ระบุ Google Apps Script Web App URL สำหรับดึงข้อมูลและตัดสต็อก:',
        input: 'text',
        inputValue: API_URL,
        inputPlaceholder: 'https://script.google.com/macros/s/.../exec',
        showCancelButton: true,
        confirmButtonColor: '#059669',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'บันทึก',
        cancelButtonText: 'ยกเลิก'
      });

      if (url && url.trim() !== "") {
        API_URL = url.trim();
        localStorage.setItem("APP_API_URL", API_URL);
        Swal.fire({ icon: 'success', title: 'บันทึกเรียบร้อย', timer: 1000, showConfirmButton: false });
        loadInventory(true);
        loadHistory();
      }
    }

    // Universal API GET
    async function apiGet(action, params = {}) {
      if (isAppsScriptEnv) {
        return new Promise((resolve, reject) => {
          if (action === "getInventory") {
            google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).getInventory();
          } else if (action === "getNextItemId") {
            google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).getNextItemId();
          } else if (action === "getHistory") {
            google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).getRequisitionHistory(params.limit || 50);
          } else {
            reject(new Error("Unknown action: " + action));
          }
        });
      }

      await checkApiConfig();
      const queryParams = new URLSearchParams({ action: action, ...params });
      const url = `${API_URL}?${queryParams.toString()}`;
      
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      return json;
    }

    // Universal API POST
    async function apiPost(action, data) {
      if (isAppsScriptEnv) {
        return new Promise((resolve, reject) => {
          if (action === "submitRequisition") {
            google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).submitRequisition(data);
          } else if (action === "addItem") {
            google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).addNewItem(data);
          } else if (action === "updateItem") {
            google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).updateItem(data);
          } else {
            reject(new Error("Unknown action: " + action));
          }
        });
      }

      await checkApiConfig();
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({ action: action, data: data })
      });

      const json = await res.json();
      return json;
    }

    // State Store
    let inventoryData = [];
    let categoriesList = new Set();

    // Init on Load
    document.addEventListener("DOMContentLoaded", async () => {
      // Set Today Date in Requisition
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('reqDate').value = today;

      if (!isAppsScriptEnv) {
        const ok = await checkApiConfig();
        if (!ok) return;
      }

      // Load Inventory
      loadInventory();
      // Load History
      loadHistory();
      // Preload Next Item ID
      fetchNextItemId();
    });

    // Tab Navigation
    function switchTab(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('bg-emerald-800', 'text-white', 'shadow');
        btn.classList.add('text-emerald-100', 'hover:bg-emerald-600');
      });

      const activeTab = document.getElementById(tabId);
      if (activeTab) activeTab.classList.remove('hidden');

      const activeBtn = document.getElementById('btn-' + tabId);
      if (activeBtn) {
        activeBtn.classList.remove('text-emerald-100', 'hover:bg-emerald-600');
        activeBtn.classList.add('bg-emerald-800', 'text-white', 'shadow');
      }

      if (tabId === 'tab-add-item') {
        fetchNextItemId();
      }
    }

    // Load Inventory
    async function loadInventory(showNotification) {
      try {
        const data = await apiGet('getInventory');
        inventoryData = data;
        populateItemSelect(data);
        renderInventoryGrid(data);
        renderLowStockAlert(data);
        if (showNotification) {
          Swal.fire({ icon: 'success', title: 'อัปเดตข้อมูลพัสดุแล้ว', timer: 1200, showConfirmButton: false });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'โหลดข้อมูลล้มเหลว', text: err.message });
      }
    }

    // Populate Dropdown & Categories
    function populateItemSelect(items) {
      const catFilter = document.getElementById('invCategoryFilter');
      catFilter.innerHTML = '<option value="ALL">ทุกหมวดหมู่</option>';
      categoriesList.clear();

      items.forEach(item => {
        if (item.category) categoriesList.add(item.category);
      });

      categoriesList.forEach(cat => {
        const catOpt = document.createElement('option');
        catOpt.value = cat;
        catOpt.textContent = cat;
        catFilter.appendChild(catOpt);
      });

      renderItemDropdown(items);
    }

    // ==========================================
    // Searchable Combobox Logic
    // ==========================================
    function renderItemDropdown(items) {
      const dropdown = document.getElementById('reqItemDropdown');
      if (!items || items.length === 0) {
        dropdown.innerHTML = '<div class="p-4 text-center text-xs text-slate-400">ไม่พบพัสดุที่ตรงกับคำค้นหา</div>';
        return;
      }

      dropdown.innerHTML = items.map(item => {
        const isOutOfStock = item.remaining <= 0;
        let stockBadge = '';
        if (isOutOfStock) {
          stockBadge = '<span class="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">หมดสต็อก</span>';
        } else if (item.remaining <= item.minStock) {
          stockBadge = `<span class="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">คงเหลือ ${item.remaining} ${item.unit}</span>`;
        } else {
          stockBadge = `<span class="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">คงเหลือ ${item.remaining} ${item.unit}</span>`;
        }

        const placeholderSvg = "data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'40\\' height=\\'40\\' viewBox=\\'0 0 24 24\\' fill=\\'%23cbd5e1\\'><path d=\\'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-7-3 3.72L9 13l-3 4h12l-4-5z\\'/></svg>";

        return `
          <div onclick="selectItem('${item.id}')" class="p-2.5 flex items-center justify-between hover:bg-emerald-50 cursor-pointer transition ${isOutOfStock ? 'opacity-60 bg-slate-50' : ''}">
            <div class="flex items-center space-x-3 min-w-0 pr-2">
              <img src="${item.image || placeholderSvg}" onerror="this.src='${placeholderSvg}'" class="w-10 h-10 object-cover rounded-lg border border-slate-200 bg-white flex-shrink-0">
              <div class="truncate">
                <div class="flex items-center space-x-1.5">
                  <span class="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">${item.id}</span>
                  <span class="text-xs text-slate-400">|</span>
                  <span class="text-xs text-slate-500">${item.category || 'ทั่วไป'}</span>
                </div>
                <h5 class="text-sm font-semibold text-slate-800 truncate">${item.name}</h5>
              </div>
            </div>
            <div class="flex-shrink-0 text-right">
              ${stockBadge}
            </div>
          </div>
        `;
      }).join('');
    }

    function openItemDropdown() {
      const dropdown = document.getElementById('reqItemDropdown');
      const chevron = document.getElementById('comboboxChevron');
      dropdown.classList.remove('hidden');
      if (chevron) chevron.classList.add('rotate-180');
      filterItemDropdown(document.getElementById('reqItemSearchInput').value);
    }

    function closeItemDropdown() {
      const dropdown = document.getElementById('reqItemDropdown');
      const chevron = document.getElementById('comboboxChevron');
      if (dropdown) dropdown.classList.add('hidden');
      if (chevron) chevron.classList.remove('rotate-180');
    }

    function toggleItemDropdown() {
      const dropdown = document.getElementById('reqItemDropdown');
      if (dropdown.classList.contains('hidden')) {
        openItemDropdown();
        document.getElementById('reqItemSearchInput').focus();
      } else {
        closeItemDropdown();
      }
    }

    function filterItemDropdown(query) {
      const q = (query || '').toLowerCase().trim();
      if (!q) {
        renderItemDropdown(inventoryData);
        return;
      }

      const filtered = inventoryData.filter(item => 
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q))
      );

      renderItemDropdown(filtered);
    }

    function selectItem(itemId) {
      const item = inventoryData.find(i => i.id === itemId);
      if (!item) return;

      document.getElementById('reqItemSelect').value = item.id;
      document.getElementById('reqItemSearchInput').value = `${item.id} : ${item.name}`;
      document.getElementById('btnClearSelectedItem').classList.remove('hidden');
      closeItemDropdown();

      onSelectItemToDisburse();
    }

    function clearSelectedItem() {
      document.getElementById('reqItemSelect').value = '';
      document.getElementById('reqItemSearchInput').value = '';
      document.getElementById('btnClearSelectedItem').classList.add('hidden');
      onSelectItemToDisburse();
      filterItemDropdown('');
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const wrapper = document.getElementById('comboboxWrapper');
      if (wrapper && !wrapper.contains(e.target)) {
        closeItemDropdown();
      }
    });

    // On Select Item in Requisition Form
    function onSelectItemToDisburse() {
      const selectedId = document.getElementById('reqItemSelect').value;
      const banner = document.getElementById('selectedItemBanner');
      const qtyUnit = document.getElementById('reqQtyUnit');
      const qtyInput = document.getElementById('reqQty');

      if (!selectedId) {
        banner.classList.add('hidden');
        qtyUnit.textContent = 'ชิ้น';
        qtyInput.removeAttribute('max');
        return;
      }

      const item = inventoryData.find(i => i.id === selectedId);
      if (item) {
        banner.classList.remove('hidden');
        document.getElementById('selectedItemId').textContent = item.id;
        document.getElementById('selectedItemTitle').textContent = item.name;
        document.getElementById('selectedItemStock').textContent = item.remaining;
        document.getElementById('selectedItemUnit').textContent = item.unit || 'ชิ้น';
        document.getElementById('selectedItemUsageBadge').textContent = item.usageType || 'เบิกขาด';
        
        // Image
        const imgEl = document.getElementById('selectedItemImg');
        imgEl.src = item.image || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="%23cbd5e1"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-7-3 3.72L9 13l-3 4h12l-4-5z"/></svg>';
        imgEl.onerror = () => { imgEl.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="%23cbd5e1"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-7-3 3.72L9 13l-3 4h12l-4-5z"/></svg>'; };

        // Unit label & Max stock limit
        qtyUnit.textContent = item.unit || 'ชิ้น';
        qtyInput.setAttribute('max', item.remaining);
      }
    }

    // Render Low Stock Alert Widget
    function renderLowStockAlert(items) {
      const lowItems = items.filter(i => i.remaining <= i.minStock);
      document.getElementById('lowStockCountBadge').textContent = lowItems.length;

      const container = document.getElementById('lowStockList');
      if (lowItems.length === 0) {
        container.innerHTML = '<p class="text-xs text-emerald-600 text-center py-6">พัสดุทุกรายการมีสต็อกเพียงพอ</p>';
        return;
      }

      container.innerHTML = lowItems.map(item => `
        <div class="flex items-center space-x-3 p-2.5 rounded-xl border ${item.remaining === 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}">
          <img src="${item.image || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\' viewBox=\'0 0 24 24\' fill=\'%23cbd5e1\'><path d=\'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-7-3 3.72L9 13l-3 4h12l-4-5z\'/></svg>'}" class="w-10 h-10 object-cover rounded-lg bg-white border border-slate-200">
          <div class="flex-1 min-w-0">
            <h5 class="text-xs font-bold text-slate-800 truncate">${item.name}</h5>
            <p class="text-[11px] text-slate-500">${item.id} | ขั้นต่ำ: ${item.minStock}</p>
          </div>
          <div class="text-right">
            <span class="text-xs font-bold ${item.remaining === 0 ? 'text-red-700' : 'text-amber-700'}">${item.remaining} ${item.unit}</span>
            <p class="text-[10px] text-slate-400">คงเหลือ</p>
          </div>
        </div>
      `).join('');
    }

    // Render Inventory Catalog Grid
    function renderInventoryGrid(items) {
      const grid = document.getElementById('inventoryGrid');
      if (items.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-12 text-slate-400">ไม่พบรายการพัสดุ</div>';
        return;
      }

      grid.innerHTML = items.map(item => {
        let statusBadge = '';
        if (item.remaining <= 0) {
          statusBadge = '<span class="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">หมดสต็อก</span>';
        } else if (item.remaining <= item.minStock) {
          statusBadge = '<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">ใกล้หมด</span>';
        } else {
          statusBadge = '<span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">พร้อมเบิก</span>';
        }

        return `
          <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition">
            <!-- Image Frame -->
            <div class="relative h-44 bg-slate-100 overflow-hidden flex items-center justify-center">
              ${item.image ? `
                <img src="${item.image}" alt="${item.name}" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'flex flex-col items-center justify-center text-slate-300\\'><i class=\\'fa-regular fa-image text-4xl mb-1\\'></i><span class=\\'text-[11px] text-slate-400\\'>ไม่มีรูปภาพ</span></div>';" class="w-full h-full object-cover">
              ` : `
                <div class="flex flex-col items-center justify-center text-slate-300">
                  <i class="fa-regular fa-image text-4xl mb-1"></i>
                  <span class="text-[11px] text-slate-400">ยังไม่มีรูปพัสดุ</span>
                </div>
              `}
              <div class="absolute top-2 left-2 font-mono text-[11px] font-bold bg-black/60 text-white px-2 py-0.5 rounded backdrop-blur-sm">
                ${item.id}
              </div>
              <div class="absolute top-2 right-2">
                ${statusBadge}
              </div>
            </div>

            <!-- Content -->
            <div class="p-4 flex-1 flex flex-col justify-between">
              <div>
                <span class="text-[11px] font-medium text-emerald-600">${item.category || 'ทั่วไป'}</span>
                <h4 class="font-bold text-slate-800 text-sm leading-snug line-clamp-2 mt-0.5" title="${item.name}">${item.name}</h4>
                <p class="text-xs text-slate-500 mt-1 line-clamp-1">${item.details || '-'}</p>
              </div>

              <div class="mt-4 pt-3 border-t border-slate-100">
                <div class="flex items-center justify-between text-xs mb-3">
                  <span class="text-slate-500">คงเหลือในคลัง:</span>
                  <span class="font-bold text-slate-800 text-sm">${item.remaining} <span class="text-xs text-slate-500 font-normal">${item.unit}</span></span>
                </div>

                <div class="flex space-x-2">
                  <button onclick="quickDisburse('${item.id}')" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-1.5 rounded-lg transition">
                    <i class="fa-solid fa-file-pen mr-1"></i> เบิกรายการนี้
                  </button>
                  <button onclick="openEditModal('${item.id}')" title="แก้ไข / เปลี่ยนรูป" class="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Filter Inventory
    function filterInventory() {
      const q = document.getElementById('invSearchInput').value.toLowerCase().trim();
      const cat = document.getElementById('invCategoryFilter').value;
      const stat = document.getElementById('invStatusFilter').value;

      const filtered = inventoryData.filter(item => {
        const matchQ = !q || item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
        const matchCat = cat === 'ALL' || item.category === cat;
        let matchStat = true;
        if (stat === 'LOW') matchStat = item.remaining > 0 && item.remaining <= item.minStock;
        if (stat === 'OUT') matchStat = item.remaining <= 0;
        if (stat === 'NORMAL') matchStat = item.remaining > item.minStock;

        return matchQ && matchCat && matchStat;
      });

      renderInventoryGrid(filtered);
    }

    // Quick Disburse Button from Inventory card
    function quickDisburse(itemId) {
      switchTab('tab-requisition');
      selectItem(itemId);
      document.getElementById('reqQty').focus();
    }

    // Handle Requisition Form Submit
    async function handleRequisitionSubmit(e) {
      e.preventDefault();

      const itemId = document.getElementById('reqItemSelect').value;
      const qty = Number(document.getElementById('reqQty').value);
      const item = inventoryData.find(i => i.id === itemId);

      if (!item) {
        Swal.fire({ icon: 'warning', title: 'กรุณาเลือกพัสดุ' });
        return;
      }

      if (qty > item.remaining) {
        Swal.fire({
          icon: 'error',
          title: 'สต็อกไม่เพียงพอ!',
          text: `พัสดุคงเหลือเพียง ${item.remaining} ${item.unit} แต่คุณขอเบิก ${qty} ${item.unit}`
        });
        return;
      }

      const confirm = await Swal.fire({
        title: 'ยืนยันการเบิกจ่าย?',
        html: `คุณกำลังจะเบิก <b>${item.name}</b><br>จำนวน <b>${qty} ${item.unit}</b>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#059669',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'ยืนยันเบิก',
        cancelButtonText: 'ยกเลิก'
      });

      if (!confirm.isConfirmed) return;

      Swal.fire({
        title: 'กำลังบันทึกและอัปโหลดรูป...',
        text: 'กรุณารอสักครู่',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      // Prepare Files
      const jobImgFile = document.getElementById('reqJobImage').files[0];
      const reqImgFile = document.getElementById('reqItemImage').files[0];

      let jobImageBase64 = "", jobImageName = "";
      let reqImageBase64 = "", reqImageName = "";

      if (jobImgFile) {
        jobImageBase64 = await readFileAsBase64(jobImgFile);
        jobImageName = jobImgFile.name;
      }

      if (reqImgFile) {
        reqImageBase64 = await readFileAsBase64(reqImgFile);
        reqImageName = reqImgFile.name;
      }

      const payload = {
        itemId: itemId,
        quantity: qty,
        date: document.getElementById('reqDate').value,
        jobName: document.getElementById('reqJobName').value,
        location: document.getElementById('reqLocation').value,
        requester: document.getElementById('reqRequester').value,
        workResult: document.getElementById('reqWorkResult').value,
        jobImageBase64: jobImageBase64,
        jobImageName: jobImageName,
        reqImageBase64: reqImageBase64,
        reqImageName: reqImageName
      };

      try {
        const res = await apiPost('submitRequisition', payload);
        if (res.success) {
          Swal.fire({
            icon: 'success',
            title: 'เบิกจ่ายสำเร็จ!',
            text: res.message,
            confirmButtonColor: '#059669'
          });
          document.getElementById('formRequisition').reset();
          clearSelectedItem();
          document.getElementById('previewJobImg').classList.add('hidden');
          document.getElementById('previewReqItemImg').classList.add('hidden');
          document.getElementById('selectedItemBanner').classList.add('hidden');
          document.getElementById('reqDate').value = new Date().toISOString().split('T')[0];
          loadInventory();
          loadHistory();
        } else {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: res.message });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message });
      }
    }

    // Next Item ID generator helper
    async function fetchNextItemId() {
      try {
        const nextId = await apiGet('getNextItemId');
        document.getElementById('addItemId').value = nextId;
      } catch (err) {
        console.error('Fetch next item ID error:', err);
      }
    }

    // Handle Add New Item Submit
    async function handleAddItemSubmit(e) {
      e.preventDefault();

      Swal.fire({
        title: 'กำลังบันทึกพัสดุใหม่...',
        text: 'กรุณารอสักครู่',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      const imgFile = document.getElementById('addItemImage').files[0];
      let imageBase64 = "", imageName = "";
      if (imgFile) {
        imageBase64 = await readFileAsBase64(imgFile);
        imageName = imgFile.name;
      }

      const payload = {
        id: document.getElementById('addItemId').value.trim(),
        name: document.getElementById('addItemName').value.trim(),
        category: document.getElementById('addItemCategory').value.trim(),
        usageType: document.getElementById('addItemUsageType').value,
        unit: document.getElementById('addItemUnit').value.trim(),
        location: document.getElementById('addItemLocation').value.trim(),
        minStock: document.getElementById('addItemMinStock').value,
        received: document.getElementById('addItemReceived').value,
        details: document.getElementById('addItemDetails').value.trim(),
        imageBase64: imageBase64,
        imageName: imageName
      };

      try {
        const res = await apiPost('addItem', payload);
        if (res.success) {
          Swal.fire({ icon: 'success', title: 'สำเร็จ', text: res.message });
          document.getElementById('formAddItem').reset();
          document.getElementById('previewAddItemImg').classList.add('hidden');
          loadInventory();
          fetchNextItemId();
          switchTab('tab-inventory');
        } else {
          Swal.fire({ icon: 'error', title: 'ล้มเหลว', text: res.message });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message });
      }
    }

    // Open Edit Modal
    function openEditModal(itemId) {
      const item = inventoryData.find(i => i.id === itemId);
      if (!item) return;

      document.getElementById('editItemIdBadge').textContent = item.id;
      document.getElementById('editItemName').value = item.name;
      document.getElementById('editItemCategory').value = item.category || '';
      document.getElementById('editItemUsageType').value = item.usageType || 'เบิกขาด';
      document.getElementById('editItemUnit').value = item.unit || 'ชิ้น';
      document.getElementById('editItemLocation').value = item.location || '';
      document.getElementById('editItemMinStock').value = item.minStock || 0;
      document.getElementById('editItemReceived').value = item.received || 0;
      document.getElementById('editItemDetails').value = item.details || '';
      document.getElementById('editItemCurrentImg').value = item.image || '';
      
      const prevImg = document.getElementById('editItemPreviewCurrent');
      prevImg.src = item.image || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'80\' height=\'80\' viewBox=\'0 0 24 24\' fill=\'%23cbd5e1\'><path d=\'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-7-3 3.72L9 13l-3 4h12l-4-5z\'/></svg>';

      document.getElementById('editItemNewImage').value = '';
      document.getElementById('editItemPreviewNew').classList.add('hidden');

      document.getElementById('modalEditItem').classList.remove('hidden');
    }

    function closeEditModal() {
      document.getElementById('modalEditItem').classList.add('hidden');
    }

    // Handle Edit Item Submit
    async function handleEditItemSubmit(e) {
      e.preventDefault();

      Swal.fire({
        title: 'กำลังบันทึกการแก้ไข...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      const newImgFile = document.getElementById('editItemNewImage').files[0];
      let imageBase64 = "", imageName = "";
      if (newImgFile) {
        imageBase64 = await readFileAsBase64(newImgFile);
        imageName = newImgFile.name;
      }

      const payload = {
        id: document.getElementById('editItemIdBadge').textContent.trim(),
        name: document.getElementById('editItemName').value.trim(),
        category: document.getElementById('editItemCategory').value.trim(),
        usageType: document.getElementById('editItemUsageType').value,
        unit: document.getElementById('editItemUnit').value.trim(),
        location: document.getElementById('editItemLocation').value.trim(),
        minStock: document.getElementById('editItemMinStock').value,
        received: document.getElementById('editItemReceived').value,
        details: document.getElementById('editItemDetails').value.trim(),
        currentImage: document.getElementById('editItemCurrentImg').value,
        imageBase64: imageBase64,
        imageName: imageName
      };

      try {
        const res = await apiPost('updateItem', payload);
        if (res.success) {
          Swal.fire({ icon: 'success', title: 'แก้ไขสำเร็จ', text: res.message });
          closeEditModal();
          loadInventory();
        } else {
          Swal.fire({ icon: 'error', title: 'แก้ไขล้มเหลว', text: res.message });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message });
      }
    }

    // Load History Table
    async function loadHistory() {
      const tbody = document.getElementById('historyTableBody');
      try {
        const history = await apiGet('getHistory', { limit: 50 });
        if (!history || history.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-slate-400">ยังไม่มีประวัติการเบิกจ่าย</td></tr>';
          return;
        }

        tbody.innerHTML = history.map(h => `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-2.5 px-3 font-medium">${h.date}</td>
            <td class="py-2.5 px-3 font-semibold text-slate-800">${h.jobName || '-'}</td>
            <td class="py-2.5 px-3 text-slate-500">${h.location || '-'}</td>
            <td class="py-2.5 px-3">${h.requester || '-'}</td>
            <td class="py-2.5 px-3">
              <span class="font-mono text-emerald-700">${h.itemId}</span> ${h.itemName}
            </td>
            <td class="py-2.5 px-3 text-right font-bold text-slate-800">${h.quantity}</td>
            <td class="py-2.5 px-3 text-center">
              ${h.jobImage ? `<a href="${h.jobImage}" target="_blank" class="inline-flex items-center text-emerald-600 hover:text-emerald-800"><i class="fa-regular fa-image text-sm"></i></a>` : '-'}
            </td>
            <td class="py-2.5 px-3">
              <span class="bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded text-[11px]">${h.status || 'สำเร็จ'}</span>
            </td>
          </tr>
        `).join('');
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-red-500">โหลดประวัติล้มเหลว: ${err.message}</td></tr>`;
      }
    }
        .withFailureHandler(err => {
          tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-red-500">โหลดประวัติล้มเหลว: ${err.message}</td></tr>`;
        })
        .getRequisitionHistory(50);
    }

    // Utilities: Preview Image on file select
    function previewUploadImage(input, previewId) {
      const preview = document.getElementById(previewId);
      if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
          preview.src = e.target.result;
          preview.classList.remove('hidden');
        };
        reader.readAsDataURL(input.files[0]);
      } else {
        preview.classList.add('hidden');
      }
    }

    // Convert File to Base64 String with max dimension downscaling for fast upload
    function readFileAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDim = 1280;
            let width = img.width;
            let height = img.height;

            if (width > height && width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            resolve(canvas.toDataURL('image/jpeg', 0.8));
          };
          img.onerror = () => resolve(e.target.result);
          img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
  