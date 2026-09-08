import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('loaded message tail survives moving focus to the next sender and back',()=>{
 const source=readFileSync(new URL('../../src/c/main.c',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('static void release_message_texts('),source.indexOf('static int32_t layout_message_reactions('));
 assert.equal((source.match(/message_body\(message, expanded\)/g)||[]).length,2);
 const dir=mkdtempSync(join(tmpdir(),'beepster-retained-text-'));
 try {
  writeFileSync(join(dir,'test.c'),`
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#define MAX_MESSAGES 6
#define DETAIL_TEXT_CAPACITY 32768
#define INLINE_MEDIA_LOADING 1
#define INLINE_MEDIA_NONE 0
#define MenuRowAlignTop 0
typedef void MenuLayer;
typedef struct { int section,row; } MenuIndex;
typedef struct { char id[121],text[256],attachment_id[100]; int is_approval,cached_text_height; char *full_text; } Message;
static Message storage[MAX_MESSAGES],*s_messages=storage;
static int s_message_count=3,s_expanded_message_index=-1,s_expanded_scroll_offset,s_expanded_text_height;
static char s_expanded_message_id[121],s_inline_attachment_id[100],s_inline_media_error[100],s_active_chat_id[121];
static char *s_detail_text;
static size_t s_detail_length,s_detail_capacity;
static bool s_expanded_message_loaded,s_has_older_messages,s_loading_older_messages;
static void *s_content_request_timer,*s_message_menu;
static int s_inline_media_state;
static void marquee_reset(void){}
static void app_timer_cancel(void*p){}
static void layer_mark_dirty(void*p){}
static void *menu_layer_get_layer(void*p){return p;}
static void copy_text(char*d,size_t n,const char*s){snprintf(d,n,"%s",s);}
static void clear_media(void){}
static void menu_layer_reload_data(void*p){}
static void message_view_refresh(void){}
static void menu_layer_set_selected_index(void*p,MenuIndex i,int a,bool b){}
static void request_selected_content(void*p){}
static void *app_timer_register(int ms,void(*fn)(void*),void*p){return (void*)1;}
static bool request_command(const char*c,const char*i){return true;}
${code}
static void select_row(int row){message_selection_changed(NULL,(MenuIndex){0,row},(MenuIndex){0,0},NULL);}
int main(void){
 for(int i=0;i<3;i++){snprintf(storage[i].id,121,"message-%d",i);strcpy(storage[i].text,"short preview ends mid-sentence");}
 select_row(0);
 s_detail_text=strdup("complete original text beyond preview: FINAL LINE");
 s_detail_length=strlen(s_detail_text);s_detail_capacity=s_detail_length+1;s_expanded_message_loaded=true;
 char *original=s_detail_text;
 select_row(1);
 assert(storage[0].full_text==original);
 assert(strstr(message_body(&storage[0],false),"FINAL LINE"));
 assert(storage[0].cached_text_height==0); /* natural row must be measured again */
 s_detail_text=strdup("next sender body");s_expanded_message_loaded=true;
 select_row(0);
 assert(s_detail_text==original && !storage[0].full_text && s_expanded_message_loaded);
 assert(strstr(message_body(&storage[0],true),"FINAL LINE"));
 assert(strcmp(message_body(&storage[1],false),"next sender body")==0);
 /* Bounded cache: evict the farthest body first, keep adjacent context. */
 storage[2].full_text=malloc(32000);memset(storage[2].full_text,'x',31999);storage[2].full_text[31999]=0;
 reserve_message_text(1000);
 assert(!storage[2].full_text && storage[1].full_text);
 free(s_detail_text);s_detail_text=NULL;
 release_message_texts();release_message_texts();
 for(int i=0;i<MAX_MESSAGES;i++)assert(!storage[i].full_text);
}
`);
  execFileSync('cc',['-fsanitize=address',join(dir,'test.c'),'-o',join(dir,'test')]);
  execFileSync(join(dir,'test'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
