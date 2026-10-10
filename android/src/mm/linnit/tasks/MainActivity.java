package mm.linnit.tasks;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

/** Online client. Records and role permissions are handled by the HTTPS server. */
public class MainActivity extends Activity {
 private static final String ORIGIN="https://linn-it-task-hub.linn-it-solu-5603.chatgpt.site";
 private WebView web;
 private ProgressBar progress;
 private ValueCallback<Uri[]> upload;
 private boolean appLoaded=false;
 private void browser(){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(ORIGIN)));}catch(Exception e){Toast.makeText(this,"Chrome သို့မဟုတ် browser တစ်ခု ထည့်ပေးပါ",Toast.LENGTH_LONG).show();}}
 private boolean trusted(Uri u){String h=u.getHost();return "https".equals(u.getScheme())&&h!=null&&(h.equals(Uri.parse(ORIGIN).getHost())||h.equals("chatgpt.com")||h.endsWith(".chatgpt.com")||h.equals("openai.com")||h.endsWith(".openai.com"));}
 @Override public void onCreate(Bundle state){super.onCreate(state);
  getWindow().setStatusBarColor(Color.rgb(18,75,65));getWindow().setNavigationBarColor(Color.WHITE);
  // Keep controls clear of system bars on Android 15's edge-to-edge layout.
  LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.WHITE);
  root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
  LinearLayout bar=new LinearLayout(this);bar.setPadding(16,5,12,5);bar.setGravity(android.view.Gravity.CENTER_VERTICAL);bar.setBackgroundColor(Color.rgb(18,75,65));
  TextView title=new TextView(this);title.setText("Linn Tasks");title.setTextColor(Color.WHITE);title.setTextSize(15);title.setTypeface(null,android.graphics.Typeface.BOLD);bar.addView(title,new LinearLayout.LayoutParams(0,50,1));
  Button reload=new Button(this);reload.setText("↻");reload.setContentDescription("ပြန်တင်ရန်");reload.setTextColor(Color.WHITE);reload.setBackgroundColor(Color.TRANSPARENT);bar.addView(reload,new LinearLayout.LayoutParams(56,50));reload.setOnClickListener(v->web.loadUrl(appLoaded?web.getUrl():ORIGIN));
  Button open=new Button(this);open.setText("Browser");open.setTextSize(10);open.setTextColor(Color.WHITE);open.setBackgroundColor(Color.TRANSPARENT);bar.addView(open,new LinearLayout.LayoutParams(90,50));open.setOnClickListener(v->browser());root.addView(bar);
  progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);root.addView(progress,new LinearLayout.LayoutParams(-1,4));
  web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setMediaPlaybackRequiresUserGesture(true);settings.setGeolocationEnabled(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);
  if(android.os.Build.VERSION.SDK_INT>=26)settings.setSafeBrowsingEnabled(true);
  CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){Uri uri=req.getUrl();if(trusted(uri))return false;try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception e){Toast.makeText(MainActivity.this,"Browser မှ ဖွင့်ပေးပါ",Toast.LENGTH_SHORT).show();}return true;}
   @Override public void onPageFinished(WebView view,String url){appLoaded=true;CookieManager.getInstance().flush();}
   @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error){handler.cancel();Toast.makeText(MainActivity.this,"လုံခြုံသော ချိတ်ဆက်မှု မရပါ။ နောက်မှ ပြန်စမ်းပါ",Toast.LENGTH_LONG).show();}
   @Override public void onReceivedError(WebView view,android.webkit.WebResourceRequest req,android.webkit.WebResourceError error){if(req.isForMainFrame())new AlertDialog.Builder(MainActivity.this).setTitle("ချိတ်ဆက်မှု မရပါ").setMessage("အင်တာနက်ချိတ်ဆက်မှုကို စစ်ပြီး ပြန်တင်ပါ။ အကောင့်ဝင်ရန် အခက်အခဲရှိလျှင် Browser မှ ဆက်သုံးနိုင်သည်။").setPositiveButton("ပြန်တင်ရန်",(d,w)->web.loadUrl(ORIGIN)).setNeutralButton("Browser",(d,w)->browser()).setNegativeButton("ပိတ်ရန်",null).show();}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public void onProgressChanged(WebView v,int value){progress.setProgress(value);progress.setVisibility(value==100?View.GONE:View.VISIBLE);}
   @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params){if(upload!=null)upload.onReceiveValue(null);upload=callback;Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");try{startActivityForResult(intent,100);return true;}catch(Exception e){upload=null;return false;}}
  });
  web.setDownloadListener((url,userAgent,contentDisposition,mimeType,contentLength)->{if(!url.startsWith(ORIGIN+"/api/files/")){Toast.makeText(this,"CSV/အရန်ကူးဖိုင် ထုတ်ယူရန် Browser မှ ဖွင့်ပေးပါ",Toast.LENGTH_LONG).show();return;}try{DownloadManager.Request r=new DownloadManager.Request(Uri.parse(url));String cookies=CookieManager.getInstance().getCookie(url);if(cookies!=null)r.addRequestHeader("Cookie",cookies);r.addRequestHeader("User-Agent",userAgent);r.setMimeType("application/octet-stream");String file=android.webkit.URLUtil.guessFileName(url,contentDisposition,mimeType);r.setTitle(file);r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);r.setDestinationInExternalFilesDir(MainActivity.this,Environment.DIRECTORY_DOWNLOADS,file);((DownloadManager)getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);Toast.makeText(this,"ဖိုင်ဒေါင်းလုဒ် စတင်ပြီးပါပြီ",Toast.LENGTH_SHORT).show();}catch(Exception e){Toast.makeText(this,"ဖိုင်ရယူရန် Browser မှ ဖွင့်ပေးပါ",Toast.LENGTH_LONG).show();}});
  if(state!=null)web.restoreState(state);else web.loadUrl(ORIGIN);
 }
 @Override protected void onSaveInstanceState(Bundle out){web.saveState(out);super.onSaveInstanceState(out);}
 @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){super.onActivityResult(requestCode,resultCode,data);if(requestCode==100&&upload!=null){upload.onReceiveValue(resultCode==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);upload=null;}}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onDestroy(){if(upload!=null){upload.onReceiveValue(null);upload=null;}web.destroy();super.onDestroy();}
}
