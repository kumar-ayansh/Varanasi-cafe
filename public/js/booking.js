function setBookingStatus(message, type) {
  const el = document.getElementById('formStatus');
  el.textContent = message;
  el.className = `form-status ${type}`;
}

// Build selectable time-slot pills (11:00 AM – 10:30 PM, 30-min steps) and
// keep the hidden #time input (HH:MM, 24hr) in sync — this is what the
// existing booking API/validation still reads, unchanged.
function initTimeSlots() {
  const wrap = document.getElementById('timeSlots');
  const hiddenInput = document.getElementById('time');
  if (!wrap || !hiddenInput) return;

  const slots = [];
  for (let mins = 11 * 60; mins <= 22 * 60 + 30; mins += 30) {
    const h24 = Math.floor(mins / 60);
    const m = mins % 60;
    const value = `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const h12 = ((h24 + 11) % 12) + 1;
    const suffix = h24 < 12 ? 'AM' : 'PM';
    const label = m === 0 ? `${h12}:00 ${suffix}` : `${h12}:${m} ${suffix}`;
    slots.push({ value, label });
  }

  wrap.innerHTML = slots.map((s) => `
    <button type="button" class="slot-pill" data-value="${s.value}">${s.label}</button>
  `).join('');

  wrap.querySelectorAll('.slot-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.slot-pill').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      hiddenInput.value = btn.dataset.value;
      hiddenInput.dispatchEvent(new Event('change'));
    });
  });
}
initTimeSlots();

async function checkAvailabilityHint() {
  const date = document.getElementById('date').value;
  const time = document.getElementById('time').value;
  const hint = document.getElementById('availabilityHint');
  if (!date || !time) { hint.textContent = ''; return; }
  try {
    const res = await fetch(`/api/bookings/availability?date=${date}&time=${time}`);
    const data = await res.json();
    hint.textContent = data.available > 0
      ? `${data.available} of ${data.totalTables} tables free at this time.`
      : 'This time slot is fully booked — please pick another.';
  } catch {
    hint.textContent = '';
  }
}
document.getElementById('date').addEventListener('change', checkAvailabilityHint);
document.getElementById('time').addEventListener('change', checkAvailabilityHint);

document.getElementById('bookingForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!document.getElementById('time').value) {
    setBookingStatus('Please choose a time slot.', 'err');
    document.getElementById('timeSlots').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const btn = document.getElementById('bookBtn');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  const payload = {
    customerName: document.getElementById('customerName').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    date: document.getElementById('date').value,
    time: document.getElementById('time').value,
    guests: document.getElementById('guests').value,
    notes: document.getElementById('notes').value.trim()
  };

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Could not submit booking.');

    const b = data.booking;
    setBookingStatus(
      `Reservation requested! Confirmation number ${b.id} — ${b.date} at ${b.time} for ${b.guests} guest(s). We'll call you at ${b.phone} to confirm.`,
      'ok'
    );
    document.getElementById('bookingForm').reset();
  } catch (err) {
    setBookingStatus(err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Request Reservation';
  }
});
