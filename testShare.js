const { CloudClient } = require('./vender/cloud189-sdk/dist/index.js');
const fs = require('fs');

async function testShareInfo() {
  const code = 'vENVmanAryqa';
  console.log('Testing code:', code);
  const client = new CloudClient({
     // we don't even need auth to fetch share info if it's public!
  });
  
  try {
     const shareInfo = await client.request('https://cloud.189.cn/api/open/share/getShareInfoByCodeV2.action?shareCode=' + code, {
        method: 'GET',
        headers: {'Accept': 'application/json;charset=UTF-8'}
     }).json();
     console.log('ShareInfo:', JSON.stringify(shareInfo, null, 2));

     const list = await client.request('https://cloud.189.cn/api/open/share/listShareDir.action', {
        method: 'GET',
        searchParams: {
           shareId: shareInfo.shareId,
           fileId: shareInfo.fileId,
           isFolder: shareInfo.isFolder,
           orderBy: 'lastOpTime',
           descending: true,
           shareMode: shareInfo.shareMode,
           pageNum: 1,
           pageSize: 1000
        },
        headers: {'Accept': 'application/json;charset=UTF-8'}
     }).json();
     
     console.log('ListShareDir Result:', JSON.stringify(list, null, 2));
  } catch(e) {
     console.error('Error:', e.response ? e.response.body : e);
  }
}
testShareInfo();
