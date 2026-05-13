// Pre-generates pools of IDs and cycles through them deterministically.

/**
 * @param {{ users: number, orders: number, carts: number, skus: number }} sizes
 */
export function createIdPool({ users, orders, carts, skus }) {
  const userIds = Array.from({ length: users }, (_, i) => `u-${i + 1}`);
  const orderIds = Array.from({ length: orders }, (_, i) => `ord-${i + 1}`);
  const cartIds = Array.from({ length: carts }, (_, i) => `cart-${i + 1}`);
  const skuIds = Array.from({ length: skus }, (_, i) => `sku-${i + 1}`);

  let ui = 0;
  let oi = 0;
  let ci = 0;
  let si = 0;

  return {
    userId: () => userIds[ui++ % users],
    orderId: () => orderIds[oi++ % orders],
    cartId: () => cartIds[ci++ % carts],
    sku: () => skuIds[si++ % skus],
  };
}
