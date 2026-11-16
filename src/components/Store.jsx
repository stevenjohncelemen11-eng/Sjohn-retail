import { useEffect, useMemo, useState } from 'react';
import { ShoppingBag, Minus, Plus, Trash2, X, ArrowRight, PackageCheck, ShieldCheck } from 'lucide-react';
import AddressFields from './AddressFields.jsx';
import { supabase } from '../lib/supabase.js';
import { peso } from '../lib/format.js';
const blankAddress={region:'',regionCode:'',province:'',provinceCode:'',city_municipality:'',cityCode:'',barangay:'',barangayCode:'',street_address:''};
export default function Store(){
 const [products,setProducts]=useState([]),[cart,setCart]=useState({}),[loading,setLoading]=useState(true),[cartOpen,setCartOpen]=useState(false),[checkout,setCheckout]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[proof,setProof]=useState(null),[customer,setCustomer]=useState({full_name:'',mobile_number:'',gcash_reference:''}),[address,setAddress]=useState(blankAddress),[selectedProduct,setSelectedProduct]=useState(null);
 const load=async()=>{if(!supabase)return;const {data,error}=await supabase.from('products').select('*').eq('is_active',true).order('created_at',{ascending:false});if(!error)setProducts(data||[]);setLoading(false);};
 useEffect(()=>{load();if(!supabase){setLoading(false);return;}const channel=supabase.channel('store-products-live').on('postgres_changes',{event:'*',schema:'public',table:'products'},()=>load()).subscribe();return()=>{supabase.removeChannel(channel);};},[]);
 const lines=useMemo(()=>products.filter(p=>cart[p.id]).map(p=>({...p,qty:cart[p.id]})),[products,cart]);
 const total=lines.reduce((s,p)=>s+Number(p.price)*p.qty,0),count=lines.reduce((s,p)=>s+p.qty,0);
 const change=(p,delta)=>setCart(old=>{const n=Math.max(0,Math.min(Number(p.stock),Number(old[p.id]||0)+delta));return {...old,[p.id]:n};});
 const placeOrder=async(e)=>{e.preventDefault();if(!supabase||!proof)return;setBusy(true);setMessage('');let proofPath='';try{
  const ext=proof.name.split('.').pop().toLowerCase();if(!['jpg','jpeg','png'].includes(ext))throw new Error('Payment proof must be a JPG or PNG image.');if(proof.size>5*1024*1024)throw new Error('Payment proof must be 5 MB or smaller.');
  proofPath=`${crypto.randomUUID()}.${ext}`;const upload=await supabase.storage.from('payment-proofs').upload(proofPath,proof,{contentType:proof.type,upsert:false});if(upload.error)throw upload.error;
  const payload={items:lines.map(x=>({product_id:x.id,quantity:x.qty})),customer_full_name:customer.full_name.trim(),customer_mobile:customer.mobile_number.trim(),customer_address:[address.street_address,address.barangay,address.city_municipality,address.province,address.region].filter(Boolean).join(', '),region:address.region,province:address.province,city_municipality:address.city_municipality,barangay:address.barangay,street_address:address.street_address.trim(),payment_reference:customer.gcash_reference.trim()||null,proof_path:proofPath};
  const {data,error}=await supabase.rpc('place_customer_order',{p_order:payload});if(error)throw error;setCart({});setCheckout(false);setCartOpen(false);setProof(null);setCustomer({full_name:'',mobile_number:'',gcash_reference:''});setAddress(blankAddress);setMessage(`Order placed successfully! Your order number is ${data}. Please keep your payment reference. We will verify your GCash payment.`);await load();
 }catch(err){if(proofPath)await supabase.storage.from('payment-proofs').remove([proofPath]);setMessage(err.message||'Unable to place order. Please try again.');}finally{setBusy(false);}};
 return <div className="min-h-screen bg-ink text-white"><header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur"><div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between"><a href="#home" className="flex items-center gap-3"><div className="w-10 h-10 bg-sun text-black rounded-xl grid place-items-center font-black">SJ</div><div><div className="font-black tracking-wide">SJohn <span className="text-sun">& Co.</span></div><div className="text-[10px] tracking-[.28em] uppercase text-zinc-500">Retail</div></div></a><button onClick={()=>setCartOpen(true)} className="relative btn-outline"><ShoppingBag size={18}/> <span className="hidden sm:inline">Cart</span><span className="absolute -top-2 -right-2 bg-sun text-black text-xs font-bold rounded-full w-5 h-5 grid place-items-center">{count}</span></button></div></header>
 <main id="home"><section className="hero max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24"><div className="max-w-2xl"><div className="inline-flex items-center gap-2 text-xs uppercase tracking-[.24em] text-sun mb-6"><span className="w-8 h-px bg-sun"/> Smart finds. Better everyday.</div><h1 className="text-5xl sm:text-7xl font-black leading-[.98] tracking-tight">GOOD FINDS.<br/><span className="text-sun">GREAT VALUE.</span></h1><p className="text-zinc-400 mt-6 max-w-lg leading-7">Discover practical picks and everyday essentials, carefully selected and delivered straight to your door.</p><a href="#shop" className="btn-primary mt-8 inline-flex">Explore collection <ArrowRight size={18}/></a></div><div className="hero-stamp hidden md:flex"><span>THE</span><b>SJ</b><span>SELECTION</span></div></section>
 <section id="shop" className="max-w-7xl mx-auto px-4 sm:px-6 py-12"><div className="flex items-end justify-between mb-8"><div><p className="eyebrow">CURATED FOR YOU</p><h2 className="section-title">Shop the collection<span className="text-sun">.</span></h2></div><span className="text-sm text-zinc-500">{products.length} products</span></div>
 {!supabase&&<div className="notice">Connect your Supabase project by filling in the .env file to load your live catalog.</div>}{loading?<div className="py-20 text-center text-zinc-500">Loading products…</div>:products.length===0?<div className="empty"><PackageCheck size={34}/><p className="font-semibold mt-3">New arrivals are on the way.</p><p className="text-sm text-zinc-500 mt-1">Please check back soon.</p></div>:<div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">{products.map(p=><article
  key={p.id}
  className="product-card cursor-pointer"
  onClick={() => setSelectedProduct(p)}
  onKeyDown={e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelectedProduct(p);
    }
  }}
  role="button"
  tabIndex={0}
  aria-label={`View details for ${p.name}`}
>
  <div className="product-image">
    {p.image_url
      ? <img src={p.image_url} alt={p.name}/>
      : <div className="placeholder">SJ<span>CO.</span></div>
    }
    {Number(p.stock)===0&&<span className="sold-out">SOLD OUT</span>}
  </div>

  <div className="p-4">
    <div className="flex justify-between gap-3">
      <h3 className="font-bold leading-snug">{p.name}</h3>
      <span className="text-sun font-bold whitespace-nowrap">{peso(p.price)}</span>
    </div>

    <p className="text-sm text-zinc-500 mt-2 line-clamp-2 min-h-10">
      {p.description||'A thoughtful pick from SJohn & Co.'}
    </p>

    <div className="flex items-center justify-between mt-4">
      <span className={`text-xs ${Number(p.stock)>0?'text-zinc-500':'text-red-400'}`}>
        {Number(p.stock)>0?`${p.stock} in stock`:'Out of stock'}
      </span>

      <button
        disabled={Number(p.stock)===0}
        onClick={e => {
          e.stopPropagation();
          change(p,1);
        }}
        className="btn-small"
      >
        <Plus size={16}/> Add
      </button>
    </div>

    <p className="text-xs text-sun mt-3">Click to view product details →</p>
  </div>
</article>)}</div>}</section></main>
 <footer className="border-t border-line mt-16"><div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row gap-3 justify-between text-xs text-zinc-500"><span>© {new Date().getFullYear()} SJohn & Co. Retail. All rights reserved.</span><span>Secure checkout · GCash manual payment</span></div></footer>{selectedProduct && (
  <div
    className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
    onMouseDown={e => {
      if (e.target === e.currentTarget) setSelectedProduct(null);
    }}
  >
    <div className="relative bg-panel border border-line rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">

      <button
        onClick={() => setSelectedProduct(null)}
        className="absolute top-3 right-3 z-10 bg-black/80 text-white rounded-full p-2"
        aria-label="Close product details"
      >
        <X size={20}/>
      </button>

      <div className="grid sm:grid-cols-2">

        <div className="bg-black/30 min-h-[260px] sm:min-h-[420px] flex items-center justify-center p-4">
          {selectedProduct.image_url ? (
            <img
              src={selectedProduct.image_url}
              alt={selectedProduct.name}
              className="w-full max-h-[420px] object-contain rounded-xl"
            />
          ) : (
            <div className="placeholder text-5xl">SJ<span>CO.</span></div>
          )}
        </div>

        <div className="p-5 sm:p-7 flex flex-col">
          <p className="eyebrow">SJOHN & CO. RETAIL</p>

          <h2 className="text-2xl sm:text-3xl font-black mt-3">
            {selectedProduct.name}
          </h2>

          <p className="text-sun text-2xl font-black mt-4">
            {peso(selectedProduct.price)}
          </p>

          <div className="mt-5">
            <h3 className="font-bold text-sm uppercase tracking-wider">
              Product Description
            </h3>
            <p className="text-zinc-300 text-sm leading-7 mt-2 whitespace-pre-wrap">
              {selectedProduct.description || 'No product description available.'}
            </p>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <p className="text-sm text-zinc-400">Availability</p>
            <p className={`font-bold mt-1 ${Number(selectedProduct.stock)>0?'text-green-400':'text-red-400'}`}>
              {Number(selectedProduct.stock)>0
                ? `${selectedProduct.stock} items available`
                : 'Currently out of stock'
              }
            </p>
          </div>

          <button
            disabled={Number(selectedProduct.stock)===0}
            onClick={() => {
              change(selectedProduct,1);
              setSelectedProduct(null);
              setMessage(`${selectedProduct.name} added to your cart!`);
            }}
            className="btn-primary w-full mt-auto pt-4 pb-4"
          >
            <ShoppingBag size={18}/>
            Add to Cart
          </button>

          <button
            onClick={() => setSelectedProduct(null)}
            className="btn-outline w-full mt-3"
          >
            Continue Shopping
          </button>
        </div>

      </div>
    </div>
  </div>
)}
 {message&&<div className="toast" role="status"><span>{message}</span><button onClick={()=>setMessage('')}><X size={16}/></button></div>}
 {cartOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCartOpen(false)}}><aside className="drawer"><div className="flex items-center justify-between p-5 border-b border-line"><h2 className="text-xl font-black">Your cart</h2><button onClick={()=>setCartOpen(false)}><X/></button></div>{!checkout?<><div className="p-5 flex-1 overflow-auto">{lines.length===0?<p className="text-zinc-500 text-sm">Your cart is empty.</p>:lines.map(p=><div key={p.id} className="flex gap-3 py-4 border-b border-line"><div className="w-16 h-16 bg-panel rounded-lg overflow-hidden">{p.image_url&&<img src={p.image_url} className="w-full h-full object-cover"/>}</div><div className="flex-1"><div className="font-semibold">{p.name}</div><div className="text-sun text-sm">{peso(p.price)}</div><div className="flex items-center gap-3 mt-2"><button onClick={()=>change(p,-1)}><Minus size={14}/></button><span className="text-sm">{p.qty}</span><button onClick={()=>change(p,1)} disabled={p.qty>=p.stock}><Plus size={14}/></button><button className="ml-auto text-zinc-500" onClick={()=>setCart(c=>({...c,[p.id]:0}))}><Trash2 size={15}/></button></div></div></div>)}</div><div className="p-5 border-t border-line"><div className="flex justify-between mb-4"><span className="text-zinc-400">Subtotal</span><b className="text-sun">{peso(total)}</b></div><button disabled={!lines.length} className="btn-primary w-full" onClick={()=>setCheckout(true)}>Continue to checkout <ArrowRight size={17}/></button></div></>:<form onSubmit={placeOrder} className="p-5 flex-1 overflow-auto space-y-4"><button type="button" onClick={()=>setCheckout(false)} className="text-xs text-sun">← Back to cart</button><h3 className="font-bold text-lg">Delivery details</h3><label className="field"><span>Full name *</span><input required value={customer.full_name} onChange={e=>setCustomer({...customer,full_name:e.target.value})} autoComplete="name"/></label><label className="field"><span>Mobile number *</span><input required type="tel" pattern="[0-9+() -]{10,18}" value={customer.mobile_number} onChange={e=>setCustomer({...customer,mobile_number:e.target.value})} placeholder="09XXXXXXXXX"/></label><AddressFields value={address} onChange={setAddress}/><label className="field"><span>Street / House No. *</span><input required value={address.street_address} onChange={e=>setAddress({...address,street_address:e.target.value})} placeholder="House no., street, subdivision"/></label><div className="rounded-xl border border-sun/30 bg-sun/5 p-4"><div className="flex gap-2 items-center text-sun font-bold"><ShieldCheck size={18}/> GCash payment</div><p className="text-sm text-zinc-300 mt-2">Send <b className="text-sun">{peso(total)}</b> to this GCash number before placing your order:</p><div className="text-2xl font-black tracking-wider my-2">09456331271</div><p className="text-xs text-zinc-500">Upload a clear screenshot of your successful payment below. Your order will remain pending until payment is verified.</p></div><label className="field"><span>GCash proof of payment * (JPG / PNG, max 5 MB)</span><input required type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={e=>setProof(e.target.files?.[0]||null)}/></label><label className="field"><span>GCash reference number (optional)</span><input value={customer.gcash_reference} onChange={e=>setCustomer({...customer,gcash_reference:e.target.value})}/></label><div className="border-t border-line pt-4 flex justify-between"><span className="text-zinc-400">Total due</span><b className="text-sun text-lg">{peso(total)}</b></div><button disabled={busy||!proof||!lines.length} className="btn-primary w-full" type="submit">{busy?'Submitting order…':'Place order'}</button><p className="text-[11px] text-zinc-600 text-center">By placing your order, you confirm that the details and payment proof are correct.</p></form>}</aside></div>}
 </div>;
}
