import{c as f,r as p,j as e,R as b,C as g}from"./index-ClrDOumY.js";import{r as _}from"./generation-costs-Ch0U9q7D.js";import{T as w}from"./triangle-alert-Dj-yMWf2.js";import{W as u}from"./wallet-rw3CsF3p.js";import{S as I}from"./shield-CA1daT53.js";import{I as k}from"./image-Mhojv-8g.js";import{L as A}from"./lock-CO14yf9k.js";import{K as R}from"./key-round-Fxa_JFhd.js";/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const P=[["path",{d:"m18 16 4-4-4-4",key:"1inbqp"}],["path",{d:"m6 8-4 4 4 4",key:"15zrgr"}],["path",{d:"m14.5 4-5 16",key:"e7oirm"}]],z=f("code-xml",P);/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const E=[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1",key:"1oajmo"}],["path",{d:"M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1",key:"mpwhp6"}]],S=f("file-json",E);/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=[["rect",{width:"20",height:"8",x:"2",y:"2",rx:"2",ry:"2",key:"ngkwjq"}],["rect",{width:"20",height:"8",x:"2",y:"14",rx:"2",ry:"2",key:"iecqi9"}],["line",{x1:"6",x2:"6.01",y1:"6",y2:"6",key:"16zg32"}],["line",{x1:"6",x2:"6.01",y1:"18",y2:"18",key:"nzw8ys"}]],y=f("server",C),N="VISIONARY_API_KEY",T=[["model","string","是","固定传 gpt-image-2。"],["prompt","string","是","提示词。建议写清主体、画面、风格和细节。"],["images","string[]","否","参考图数组。支持 HTTPS 图片 URL、data URI，或图片 base64 字符串。最多 9 张。"],["aspectRatio","string","否","比例或像素值，例如 1:1、16:9、1024x1024、2048x2048。默认 1:1。"],["replyType","string","否","返回类型。推荐 json；也支持 stream 返回最终 SSE 事件。"],["quality","string","否","质量参数。支持 auto、low、medium、high。仅部分高分辨率线路生效。"],["imageSize","string","否","可选分辨率参数。通常不用传，系统会根据 aspectRatio 自动识别。"]],K=[["model","string","是","支持 nano-banana-pro 或 nano-banana-pro-fast。"],["prompt","string","是","提示词。建议写清主体、画面、风格和细节。"],["images","string[]","否","参考图数组。支持 HTTPS 图片 URL、data URI，或图片 base64 字符串。最多 9 张。"],["aspectRatio","string","否","比例，例如 1:1、16:9、9:16、21:9、4:3、3:4、3:2、2:3。默认 1:1。"],["imageSize","string","否","传 2K 时走稳定线路；传 4K 时走高清线路。默认 2K。"],["optimizeChineseText","boolean","否","是否AI增强。仅 nano-banana-pro 生效，开启后额外消耗 8 点。"],["replyType","string","否","返回类型。推荐 json；也支持 stream 返回最终 SSE 事件。"]],O=[["model","string","是","固定传 gpt-5.4。"],["messages","array","是","OpenAI Chat Completions 消息数组。"],["stream","boolean","否","是否使用流式返回。默认 false。"],["temperature","number","否","采样温度。可按客户端需要传递。"],["max_tokens","number","否","最大输出 tokens。也支持 max_completion_tokens。"]];function c(s,i,a,l,x){return _(s,{source:"openapi",billingMode:"standard",model:i,imageSize:a,quality:l,ratio:x})}function B(s){const i=c(s,"gpt-image-2","STANDARD"),a=c(s,"gpt-image-2","2K"),l=c(s,"gpt-image-2","4K");return[{model:"gpt-image-2",name:"GPT Image 2",cost:`标准 ${i} 点 / 2K ${a} 点 / 4K ${l} 点`,ratio:"支持比例或像素值，如 1:1、16:9、1024x1024、2048x2048、3840x2160",note:"推荐模型。系统会根据 aspectRatio 的像素尺寸自动识别标准、2K 或 4K。"}]}function $(s){return[{model:"nano-banana-pro",name:"Nano Banana Pro",cost:`${c(s,"Nano_Banana_Pro")} 点，开启AI增强 +8 点`,ratio:"1:1 / 16:9 / 9:16 / 21:9 / 4:3 / 3:4 / 3:2 / 2:3",note:"支持参考图。"},{model:"nano-banana-pro-fast",name:"Nano Banana Pro Fast",cost:`${c(s,"nano-banana-pro-fast")} 点`,ratio:"1:1 / 16:9 / 9:16 / 21:9 / 4:3 / 3:4 / 3:2 / 2:3",note:"开放 API 专用快速线路，支持参考图。"}]}const q=[{model:"gpt-5.4",name:"GPT-5.4",cost:"输入 ¥1.4 / 百万 tokens，输出 ¥12 / 百万 tokens",ratio:"messages / stream / temperature / max_tokens",note:"OpenAI Chat Completions 兼容文本模型，按 token 换算扣除 Key 额度。"}];function r({children:s}){return e.jsx("code",{className:"rounded-md border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 text-[0.84em] font-semibold text-sky-200",children:s})}function G(s){return s.split(new RegExp(`(${N})`,"g")).map((a,l)=>a===N?e.jsx("span",{className:"font-semibold text-sky-300",children:a},`${a}-${l}`):e.jsx(b.Fragment,{children:a},`${a}-${l}`))}function d({children:s}){return e.jsx("pre",{className:"overflow-x-auto rounded-xl border border-white/10 bg-[#0b1020] px-4 py-4 text-[0.74rem] leading-[1.3rem] text-zinc-200 shadow-inner shadow-black/30",children:e.jsx("code",{children:G(s)})})}function m({title:s,icon:i,children:a}){return e.jsxs("section",{className:"rounded-2xl border border-white/10 bg-[#11131a]",children:[e.jsxs("div",{className:"flex items-center gap-3 border-b border-white/10 px-5 py-4",children:[e.jsx("div",{className:"flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-200",children:i}),e.jsx("h2",{className:"text-[1rem] font-semibold text-white",children:s})]}),e.jsx("div",{className:"p-5",children:a})]})}function v({icon:s,title:i,body:a}){return e.jsx("article",{className:"rounded-xl border border-white/10 bg-black/20 p-4",children:e.jsxs("div",{className:"flex items-start gap-3",children:[e.jsx("div",{className:"mt-0.5 text-sky-200",children:s}),e.jsxs("div",{children:[e.jsx("h3",{className:"text-[0.86rem] font-semibold text-white",children:i}),e.jsx("p",{className:"mt-1 text-[0.74rem] leading-5 text-zinc-400",children:a})]})]})})}function F({config:s,endpointUrl:i,endpointBaseUrl:a}){const l=`curl --location '${i}' \\
--header 'Authorization: Bearer VISIONARY_API_KEY' \\
--header 'Content-Type: application/json' \\
--data '${s.requestExample}'`,x=`const VISIONARY_API_KEY = '请替换成您拿到的 API Key';

const response = await fetch('${i}', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + VISIONARY_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(${s.requestExample})
});

const result = await response.json();
if (!response.ok) {
  throw new Error(result.error || '生成失败');
}

const imageUrl = result.results?.[0]?.url;`;return e.jsxs("section",{id:s.id,className:"scroll-mt-28 space-y-5",children:[e.jsxs("section",{className:"rounded-2xl border border-white/10 bg-[#11131a]",children:[e.jsxs("div",{className:"border-b border-white/10 px-5 py-5",children:[e.jsxs("div",{className:"mb-3 flex flex-wrap items-center gap-2",children:[e.jsx("span",{className:"rounded-md bg-orange-500/15 px-2.5 py-1 text-[0.75rem] font-black text-orange-300",children:"POST"}),e.jsx("span",{className:"rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[0.72rem] font-semibold text-emerald-200",children:"同步返回结果"})]}),e.jsx("h1",{className:"text-[1.7rem] font-semibold text-white",children:s.title}),e.jsx("p",{className:"mt-2 text-[0.82rem] leading-6 text-zinc-400",children:s.subtitle})]}),e.jsxs("div",{className:"p-4",children:[e.jsxs("div",{className:"flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-3 md:flex-row md:items-center",children:[e.jsx("span",{className:"flex-none rounded-md bg-orange-500/15 px-2.5 py-1 text-[0.75rem] font-black text-orange-300",children:"POST"}),e.jsx("code",{className:"min-w-0 flex-1 break-all text-[0.88rem] font-semibold text-sky-100",children:a})]}),s.compatiblePaths&&s.compatiblePaths.length>0&&e.jsxs("div",{className:"mt-3 rounded-xl border border-white/10 bg-black/15 p-3",children:[e.jsx("div",{className:"text-[0.72rem] font-bold text-zinc-500",children:"兼容路径"}),e.jsx("div",{className:"mt-2 grid gap-2",children:s.compatiblePaths.map(t=>e.jsx("code",{className:"break-all rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-[0.78rem] font-semibold text-zinc-200",children:t},t))})]})]})]}),e.jsx("section",{className:"grid gap-3 md:grid-cols-3",children:s.tiles.map(t=>e.jsx(b.Fragment,{children:e.jsx(v,{icon:t.icon,title:t.title,body:t.body})},t.title))}),e.jsx(m,{title:"认证方式",icon:e.jsx(A,{size:17}),children:e.jsxs("div",{className:"space-y-3 text-[0.82rem] leading-6 text-zinc-300",children:[e.jsx("p",{children:"请求头必须携带 API Key："}),e.jsx(d,{children:`Authorization: Bearer VISIONARY_API_KEY
Content-Type: application/json`})]})}),e.jsx(m,{title:"请求参数",icon:e.jsx(S,{size:17}),children:e.jsx("div",{className:"overflow-hidden rounded-xl border border-white/10",children:e.jsxs("table",{className:"w-full min-w-[760px] border-collapse text-left text-[0.78rem]",children:[e.jsx("thead",{className:"bg-white/[0.04] text-zinc-400",children:e.jsxs("tr",{children:[e.jsx("th",{className:"px-4 py-3 font-semibold",children:"参数名"}),e.jsx("th",{className:"px-4 py-3 font-semibold",children:"类型"}),e.jsx("th",{className:"px-4 py-3 font-semibold",children:"必填"}),e.jsx("th",{className:"px-4 py-3 font-semibold",children:"说明"})]})}),e.jsx("tbody",{className:"divide-y divide-white/10",children:s.requestRows.map(([t,j,h,n])=>e.jsxs("tr",{className:"align-top",children:[e.jsx("td",{className:"px-4 py-3",children:e.jsx(r,{children:t})}),e.jsx("td",{className:"px-4 py-3 text-zinc-300",children:j}),e.jsx("td",{className:"px-4 py-3 text-zinc-300",children:h}),e.jsx("td",{className:"px-4 py-3 leading-6 text-zinc-400",children:n})]},t))})]})})}),e.jsx(m,{title:"请求示例",icon:e.jsx(z,{size:17}),children:e.jsxs("div",{className:"grid gap-4 xl:grid-cols-2",children:[e.jsxs("div",{className:"space-y-3",children:[e.jsx("h3",{className:"text-[0.88rem] font-semibold text-white",children:"JSON Body"}),e.jsx(d,{children:s.requestExample})]}),e.jsxs("div",{className:"space-y-3",children:[e.jsx("h3",{className:"text-[0.88rem] font-semibold text-white",children:"cURL"}),e.jsx(d,{children:l})]}),e.jsxs("div",{className:"space-y-3 xl:col-span-2",children:[e.jsx("h3",{className:"text-[0.88rem] font-semibold text-white",children:"JavaScript"}),e.jsx(d,{children:x})]})]})}),e.jsx(m,{title:"返回响应",icon:e.jsx(g,{size:17}),children:e.jsxs("div",{className:"grid gap-4 xl:grid-cols-2",children:[e.jsxs("div",{className:"space-y-3",children:[e.jsxs("div",{className:"flex items-center gap-2 text-[0.88rem] font-semibold text-white",children:[e.jsx("span",{className:"rounded-md bg-emerald-500/15 px-2 py-0.5 text-[0.72rem] text-emerald-200",children:"200"}),"生成成功"]}),e.jsx(d,{children:s.responseExample})]}),e.jsxs("div",{className:"space-y-3",children:[e.jsxs("div",{className:"flex items-center gap-2 text-[0.88rem] font-semibold text-white",children:[e.jsx("span",{className:"rounded-md bg-red-500/15 px-2 py-0.5 text-[0.72rem] text-red-200",children:"400 / 403 / 429 / 500"}),"生成失败"]}),e.jsx(d,{children:s.errorExample})]})]})}),e.jsx(m,{title:"模型消耗积分额度",icon:e.jsx(k,{size:17}),children:e.jsx("div",{className:"grid gap-3",children:s.modelRows.map(t=>e.jsxs("article",{className:"rounded-xl border border-white/10 bg-black/20 p-4",children:[e.jsxs("div",{className:"flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between",children:[e.jsxs("div",{children:[e.jsx("h3",{className:"text-[0.95rem] font-semibold text-white",children:t.name}),e.jsx("div",{className:"mt-2",children:e.jsx(r,{children:t.model})})]}),e.jsx("div",{className:"rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-[0.78rem] font-semibold text-sky-100",children:t.cost})]}),e.jsxs("div",{className:"mt-3 grid gap-2 text-[0.76rem] leading-5 text-zinc-400 lg:grid-cols-2",children:[e.jsxs("div",{children:["参数：",t.ratio]}),e.jsxs("div",{children:["说明：",t.note]})]})]},t.model))})}),e.jsx(m,{title:"接入说明",icon:e.jsx(R,{size:17}),children:e.jsx("div",{className:"grid gap-3 md:grid-cols-2",children:(s.connectionTiles||[{icon:e.jsx(g,{size:18}),title:"读取图片地址",body:e.jsxs(e.Fragment,{children:["成功后直接读取 ",e.jsx(r,{children:"results[0].url"}),"，用于展示或保存。"]})},{icon:e.jsx(w,{size:18}),title:"旧接口不展示但仍可用",body:"旧版接口、Gemini 兼容接口和 ChatBox 接口没有删除，已有用户的接入不会受影响。"}]).map(t=>e.jsx(b.Fragment,{children:e.jsx(v,{icon:t.icon,title:t.title,body:t.body})},t.title))})})]})}const J=()=>{const[s,i]=p.useState([]),a=p.useMemo(()=>{const n="".trim().replace(/\/+$/,"");if(n)return n;if(typeof window>"u")return"https://visionary.beer";const o=window.location.origin.replace(/\/+$/,"");return o.includes("localhost")||o.includes("127.0.0.1")?"https://visionary.beer":o},[]);p.useEffect(()=>{let n=!0;return fetch("/api/model-credit-configs",{credentials:"include"}).then(async o=>o.ok?o.json():null).then(o=>{n&&i(Array.isArray(o==null?void 0:o.data)?o.data:[])}).catch(()=>{n&&i([])}),()=>{n=!1}},[]);const l=p.useMemo(()=>B(s),[s]),x=p.useMemo(()=>$(s),[s]),t=c(s,"Nano_Banana_Pro"),j=c(s,"nano-banana-pro-fast"),h=[{id:"gpt-5-4",navLabel:"gpt-5.4 文本接口",title:"gpt-5.4 文本接口",subtitle:"OpenAI Chat Completions 兼容文本接口，适合在 ChatBox 或自己的服务端中直接配置使用。",endpointPath:"/v1/chat/completions",compatiblePaths:["/v1/chat/completions","/openapi/v1/chat/completions"],requestRows:O,modelRows:q,requestExample:`{
  "model": "gpt-5.4",
  "messages": [
    {
      "role": "user",
      "content": "帮我写一段产品介绍，语气简洁有吸引力。"
    }
  ],
  "stream": false
}`,responseExample:`{
  "id": "chatcmpl_visionary",
  "object": "chat.completion",
  "created": 1770000000,
  "model": "gpt-5.4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "这里是模型返回的文本内容。"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 120,
    "completion_tokens": 220,
    "total_tokens": 340
  }
}`,errorExample:`{
  "error": {
    "message": "当前 API Key 额度不足，本次文本模型请求预计需要至少 1 点。",
    "type": "insufficient_quota",
    "code": null
  }
}`,tiles:[{icon:e.jsx(z,{size:18}),title:"OpenAI 兼容",body:e.jsxs(e.Fragment,{children:["Base URL 填 ",e.jsx(r,{children:"https://visionary.beer/v1"}),"，模型填写 ",e.jsx(r,{children:"gpt-5.4"}),"。"]})},{icon:e.jsx(u,{size:18}),title:"按 token 扣额度",body:"输入 ¥1.4 / 百万 tokens，输出 ¥12 / 百万 tokens，系统会按实际 token 用量换算扣除 Key 额度。"},{icon:e.jsx(y,{size:18}),title:"适合 ChatBox",body:"ChatBox 中使用 OpenAI 兼容模式配置即可。"}],connectionTiles:[{icon:e.jsx(g,{size:18}),title:"读取文本结果",body:e.jsxs(e.Fragment,{children:["成功后读取 ",e.jsx(r,{children:"choices[0].message.content"}),"。"]})},{icon:e.jsx(w,{size:18}),title:"生图请用生图接口",body:e.jsxs(e.Fragment,{children:["文本聊天用 ",e.jsx(r,{children:"/v1/chat/completions"}),"，图片生成用 ",e.jsx(r,{children:"/v1/api/generate"})," 或 ",e.jsx(r,{children:"/v1/api/nano-banana"}),"。"]})}]},{id:"gpt-image-2",navLabel:"gpt-image-2 接口",title:"gpt-image-2 接口",subtitle:"新项目推荐使用这个简洁入口。旧版开放 API、Gemini 兼容接口和 ChatBox 接口仍然保留，老用户不受影响。",endpointPath:"/v1/api/generate",compatiblePaths:["/v1/api/generate","/v1/images/generations","/openapi/v1/images/generations","/v1/chat/completions"],requestRows:T,modelRows:l,requestExample:`{
  "model": "gpt-image-2",
  "prompt": "生成一张边牧与古牧正在抖音直播间直播带货截图",
  "images": [],
  "aspectRatio": "1024x1024",
  "replyType": "json"
}`,responseExample:`{
  "id": "16-5f3cf761-a4bb-486a-8016-77f490998f80",
  "status": "succeeded",
  "results": [
    {
      "url": "https://visionary.beer/api/generations/16-5f3cf761-a4bb-486a-8016-77f490998f80/display"
    }
  ]
}`,errorExample:`{
  "error": "当前 API Key 额度不足，无法继续生成。"
}`,tiles:[{icon:e.jsx(I,{size:18}),title:"服务端调用",body:e.jsxs(e.Fragment,{children:["不要把 ",e.jsx(r,{children:"VISIONARY_API_KEY"})," 写进网页前端代码，避免密钥泄露和额度被盗刷。"]})},{icon:e.jsx(u,{size:18}),title:"按 Key 扣额度",body:"生成成功后按模型扣减额度；额度不足会直接拒绝，不会继续发起生成。"}]},{id:"nano-banana",navLabel:"nano-banana 接口",title:"nano-banana 接口",subtitle:"专用于 Nano Banana Pro 的独立入口，接入形式与 gpt-image-2 接口一致。",endpointPath:"/v1/api/nano-banana",compatiblePaths:["/v1/api/nano-banana","/v1beta/models/nano-banana-pro:generateContent","/v1beta/models/nano-banana-pro/generateContent","/v1beta/models/nano-banana-pro:streamGenerateContent"],requestRows:K,modelRows:x,requestExample:`{
  "model": "nano-banana-pro",
  "prompt": "将两张参考图融合成一张插画海报，保留主体轮廓",
  "images": [
    "https://your-cdn.com/input-a.png",
    "https://your-cdn.com/input-b.png"
  ],
  "aspectRatio": "16:9",
  "imageSize": "2K",
  "optimizeChineseText": false,
  "replyType": "json"
}`,responseExample:`{
  "id": "nb-5f3cf761-a4bb-486a-8016-77f490998f80",
  "status": "succeeded",
  "results": [
    {
      "url": "https://visionary.beer/api/generations/nb-5f3cf761-a4bb-486a-8016-77f490998f80/display"
    }
  ]
}`,errorExample:`{
  "error": "nano-banana 接口仅支持 nano-banana-pro 或 nano-banana-pro-fast 模型。"
}`,tiles:[{icon:e.jsx(k,{size:18}),title:"支持模型",body:e.jsxs(e.Fragment,{children:["该接口支持 ",e.jsx(r,{children:"nano-banana-pro"})," 和 ",e.jsx(r,{children:"nano-banana-pro-fast"}),"。"]})},{icon:e.jsx(u,{size:18}),title:"固定扣额度",body:`nano-banana-pro 成功扣 ${t} 点，开启AI增强后额外扣 8 点；nano-banana-pro-fast 成功扣 ${j} 点；失败不扣最终额度。`},{icon:e.jsx(y,{size:18}),title:"分辨率",body:"imageSize=2K 使用稳定线路，imageSize=4K 使用高清线路。"}],connectionTiles:[{icon:e.jsx(g,{size:18}),title:"读取图片地址",body:e.jsxs(e.Fragment,{children:["成功后直接读取 ",e.jsx(r,{children:"results[0].url"}),"，用于展示或保存。"]})},{icon:e.jsx(y,{size:18}),title:"ChatBox Gemini 兼容",body:e.jsxs(e.Fragment,{children:["ChatBox 选择 Google Gemini API 兼容模式时，基础地址填 ",e.jsx(r,{children:"https://visionary.beer"}),"，模型填 ",e.jsx(r,{children:"nano-banana-pro"})," 或 ",e.jsx(r,{children:"nano-banana-pro-fast"}),"。"]})}]}];return e.jsx("div",{className:"min-h-screen bg-[#050505] px-4 pb-20 pt-28 text-zinc-200 md:px-6 md:pt-32",children:e.jsxs("div",{className:"mx-auto grid max-w-[1500px] gap-6 lg:grid-cols-[220px_minmax(0,1fr)]",children:[e.jsx("aside",{className:"lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto",children:e.jsxs("nav",{className:"rounded-2xl border border-white/10 bg-[#11131a] p-3",children:[e.jsx("div",{className:"px-2 pb-3 text-[0.64rem] font-bold uppercase tracking-[0.22em] text-zinc-500",children:"API 文档"}),e.jsx("div",{className:"grid gap-1.5",children:h.map((n,o)=>e.jsxs("a",{href:`#${n.id}`,className:"rounded-xl px-3 py-2 text-[0.78rem] font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white",children:[e.jsx("span",{className:"mr-2 text-[0.66rem] font-black text-sky-300",children:o+1}),n.navLabel]},n.id))})]})}),e.jsx("main",{className:"space-y-8",children:h.map(n=>e.jsx(b.Fragment,{children:e.jsx(F,{config:n,endpointUrl:`${a}${n.endpointPath}`,endpointBaseUrl:a})},n.id))})]})})};export{J as ApiDocs};
