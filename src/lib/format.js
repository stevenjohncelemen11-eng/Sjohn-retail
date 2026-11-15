export const peso = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0));
export const ORDER_STATUSES = ['Pending Payment Verification', 'Payment Verified / Processing', 'Shipped', 'Delivered', 'Cancelled'];
export const fullAddress = (o) => [o.street_address, o.barangay, o.city_municipality, o.province, o.region].filter(Boolean).join(', ');
