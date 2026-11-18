/* 展示用日期、门店范围与分页；不改变租赁计费和权限规则。 */
(function () {
  function day(value = new Date()) { return new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 10); }
  function addDays(date, offset) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return '';
    const stamp = new Date(date + 'T00:00:00Z');
    if (!Number.isFinite(stamp.getTime()) || stamp.toISOString().slice(0, 10) !== date) return '';
    stamp.setUTCDate(stamp.getUTCDate() + offset);
    return stamp.toISOString().slice(0, 10);
  }
  function dueDate(contract) {
    const days = Number(contract.days);
    if (!Number.isInteger(days) || days < 1) return '';
    return addDays(contract.startDate || (contract.createdAt ? day(contract.createdAt) : ''), days - 1);
  }
  function storeIds(state, kind, row) {
    if (kind === 'equipment') {
      if (row.location) return [row.location];
      const contract = state.contracts.find(c => c.items.some(i => i.equipmentId === row.id && !i.returnAt));
      const segment = contract && contract.items.find(i => i.equipmentId === row.id && !i.returnAt);
      return [segment ? segment.outStore : row.home];
    }
    if (kind === 'customers') return state.contracts.filter(c => c.customerId === row.id).map(c => c.storeId)
      .concat((state.reservations || []).filter(r => r.email === row.email).map(r => r.storeId));
    if (kind === 'history') {
      const target = state.contracts.concat(state.reservations || [], state.repairs, state.shifts).find(x => x.id === row.target);
      if (target) return [target.storeId];
      const equipment = state.equipment.find(x => x.id === row.target);
      return equipment ? storeIds(state, 'equipment', equipment) : [];
    }
    return [row.storeId];
  }
  function inStore(state, kind, row, store) { return store === '*' || storeIds(state, kind, row).includes(store); }
  function filterRows(state, kind, rows, options = {}) {
    const { store = '*', query = '', status = '全部', from = '', to = '' } = options;
    return rows.filter(row => {
      const date = row.startDate || row.date || (row.createdAt || row.at ? day(row.createdAt || row.at) : row.purchased || '');
      return inStore(state, kind, row, store) && (!query || JSON.stringify(row).toLowerCase().includes(query.trim().toLowerCase()))
        && (status === '全部' || row.status === status) && (!from || date >= from) && (!to || (date && date <= to));
    });
  }
  function paginate(rows, requested = 1, size = 10) {
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const page = Math.min(pages, Math.max(1, Number(requested) || 1));
    return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, pages };
  }
  function events(state, store = '*') {
    const pickups = (state.reservations || []).filter(r => ['待确认', '已确认'].includes(r.status) && inStore(state, 'bookings', r, store))
      .map(r => ({ kind: 'pickup', date: r.startDate, id: r.id, name: r.name, storeId: r.storeId, count: r.items.length, status: r.status }));
    const returns = state.contracts.filter(c => c.items.some(i => !i.returnAt) && inStore(state, 'contracts', c, store))
      .map(c => ({ kind: 'return', date: dueDate(c), id: c.id, name: c.customerName, storeId: c.storeId, count: c.items.filter(i => !i.returnAt).length, status: c.status }));
    return pickups.concat(returns).filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date));
  }
  const api = { day, addDays, dueDate, storeIds, inStore, filterRows, paginate, events };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.BsrPresentation = api;
})();
