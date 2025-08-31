// fetch_sat_batch_array.c (stateful merge + history)
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <curl/curl.h>
#include "cJSON.h"

#define HISTORY_MAX 4
#define FAIL_DECAY_THRESHOLD 3

typedef struct { char *data; size_t len; size_t cap; } Buf;

static size_t write_cb(void *ptr, size_t size, size_t nmemb, void *userdata) {
    size_t bytes = size * nmemb;
    Buf *b = (Buf *)userdata;
    if (b->len + bytes + 1 > b->cap) {
        size_t newcap = b->cap ? b->cap * 2 : 4096;
        while (newcap < b->len + bytes + 1) newcap *= 2;
        char *tmp = (char *)realloc(b->data, newcap);
        if (!tmp) return 0;
        b->data = tmp; b->cap = newcap;
    }
    memcpy(b->data + b->len, ptr, bytes);
    b->len += bytes;
    b->data[b->len] = '\0';
    return bytes;
}

static void usage(const char *prog) {
    fprintf(stderr,
        "Usage: %s <input_file>\n"
        "Each line: satid olat olng oalt seconds\n", prog);
}


static char *slurp(const char *path, size_t *out_n) {
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    if (n < 0) { fclose(f); return NULL; }
    fseek(f, 0, SEEK_SET);
    char *buf = (char *)malloc((size_t)n + 1);
    if (!buf) { fclose(f); return NULL; }
    size_t rd = fread(buf, 1, (size_t)n, f);
    fclose(f);
    buf[rd] = '\0';
    if (out_n) *out_n = rd;
    return buf;
}

static cJSON *find_by_id(cJSON *arr, const char *id) {
    int n = cJSON_GetArraySize(arr);
    for (int i = 0; i < n; i++) {
        cJSON *o = cJSON_GetArrayItem(arr, i);
        cJSON *idj = cJSON_GetObjectItemCaseSensitive(o, "id");
        if (cJSON_IsString(idj) && strcmp(idj->valuestring, id) == 0) return o;
    }
    return NULL;
}

static void ensure_field_defaults(cJSON *obj) {
    if (!cJSON_GetObjectItemCaseSensitive(obj, "satname")) cJSON_AddNullToObject(obj, "satname");
    if (!cJSON_GetObjectItemCaseSensitive(obj, "status"))  cJSON_AddNumberToObject(obj, "status", 0);
    if (!cJSON_GetObjectItemCaseSensitive(obj, "decayed")) cJSON_AddFalseToObject(obj, "decayed");
    if (!cJSON_GetObjectItemCaseSensitive(obj, "failCount")) cJSON_AddNumberToObject(obj, "failCount", 0);
    if (!cJSON_GetObjectItemCaseSensitive(obj, "lastChecked")) cJSON_AddNumberToObject(obj, "lastChecked", 0);

    cJSON *loc = cJSON_GetObjectItemCaseSensitive(obj, "location");
    if (!cJSON_IsObject(loc)) {
        cJSON *nl = cJSON_CreateObject();
        cJSON_AddNumberToObject(nl, "lat", 999);
        cJSON_AddNumberToObject(nl, "lon", 999);
        cJSON_AddItemToObject(obj, "location", nl);
    }
    if (!cJSON_IsArray(cJSON_GetObjectItemCaseSensitive(obj, "history"))) {
        cJSON_AddItemToObject(obj, "history", cJSON_CreateArray());
    }
}

static void set_location(cJSON *obj, double lat, double lon) {
    cJSON *loc = cJSON_CreateObject();
    cJSON_AddNumberToObject(loc, "lat", lat);
    cJSON_AddNumberToObject(loc, "lon", lon);
    cJSON_ReplaceItemInObjectCaseSensitive(obj, "location", loc);
}

static void set_location_flag(cJSON *obj) { set_location(obj, 999, 999); }

static void trim_history(cJSON *hist) {
    while (cJSON_GetArraySize(hist) > HISTORY_MAX) {
        cJSON_DeleteItemFromArray(hist, cJSON_GetArraySize(hist) - 1);
    }
}

static void prepend_history_point(cJSON *obj, double lat, double lon, double ts) {
    cJSON *hist = cJSON_GetObjectItemCaseSensitive(obj, "history");
    if (!cJSON_IsArray(hist)) {
        hist = cJSON_CreateArray();
        cJSON_ReplaceItemInObjectCaseSensitive(obj, "history", hist);
    }
    
    cJSON *pt = cJSON_CreateObject();
    cJSON_AddNumberToObject(pt, "lat", lat);
    cJSON_AddNumberToObject(pt, "lon", lon);
    cJSON_AddNumberToObject(pt, "t", ts);

    cJSON_InsertItemInArray(hist, 0, pt);
    trim_history(hist);
}

int main(int argc, char **argv) {
    if (argc != 2) { usage(argv[0]); return 2; }

    const char *inpath  = argv[1];
    const char *outpath = "data.json";
    const char *apikey  = getenv("N2YO_API_KEY");
    if (!apikey || !*apikey) {
        fprintf(stderr, "Api key not set!");
    }

    cJSON *state = NULL;
    {
        size_t n = 0;
        char *old = slurp(outpath, &n);
        if (old && n > 0) state = cJSON_Parse(old);
        free(old);
        if (!state || !cJSON_IsArray(state)) {
            if (state) cJSON_Delete(state);
            state = cJSON_CreateArray();
        }
    }

    curl_global_init(CURL_GLOBAL_DEFAULT);
    CURL *curl = curl_easy_init();
    if (!curl) { fprintf(stderr, "curl init failed\n"); cJSON_Delete(state); return 1; }
    Buf resp = (Buf){0};
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_cb);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &resp);
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_USERAGENT, "sat-fetcher/1.1");

    FILE *in = fopen(inpath, "r");
    if (!in) { perror("open input"); curl_easy_cleanup(curl); curl_global_cleanup(); cJSON_Delete(state); return 1; }

    char line[1024];
    int okcnt = 0, failcnt = 0;
    time_t now = time(NULL);

    while (fgets(line, sizeof(line), in)) {
        char satid[64], olat[64], olng[64], oalt[64], seconds[64];
        if (sscanf(line, "%63s %63s %63s %63s %63s", satid, olat, olng, oalt, seconds) != 5) {

            continue;
        }


        cJSON *obj = find_by_id(state, satid);
        if (!obj) {
            obj = cJSON_CreateObject();
            cJSON_AddStringToObject(obj, "id", satid);
            cJSON_AddItemToArray(state, obj);
        }
        ensure_field_defaults(obj);


        char url[640];
        snprintf(url, sizeof(url),
                 "https://api.n2yo.com/rest/v1/satellite/positions/%s/%s/%s/%s/%s&apiKey=%s",
                 satid, olat, olng, oalt, seconds, apikey);


        resp.len = 0;
        if (resp.data) resp.data[0] = '\0';

        curl_easy_setopt(curl, CURLOPT_URL, url);
        CURLcode cres = curl_easy_perform(curl);
        long http_code = 0;
        curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);


        cJSON_ReplaceItemInObjectCaseSensitive(obj, "lastChecked", cJSON_CreateNumber((double)now));

        cJSON *fail_j = cJSON_GetObjectItemCaseSensitive(obj, "failCount");
        int failCount = cJSON_IsNumber(fail_j) ? (int)fail_j->valuedouble : 0;

        if (cres != CURLE_OK || http_code < 200 || http_code >= 400) {

            failCount++;
            cJSON_ReplaceItemInObjectCaseSensitive(obj, "failCount", cJSON_CreateNumber(failCount));
            if (failCount >= FAIL_DECAY_THRESHOLD) {
                cJSON_ReplaceItemInObjectCaseSensitive(obj, "status",  cJSON_CreateNumber(0));
                cJSON_ReplaceItemInObjectCaseSensitive(obj, "decayed", cJSON_CreateTrue());
                set_location_flag(obj);
            }
            failcnt++;
            continue;
        }


        cJSON *root = cJSON_Parse(resp.data);
        if (!root) {
            failCount++;
            cJSON_ReplaceItemInObjectCaseSensitive(obj, "failCount", cJSON_CreateNumber(failCount));
            if (failCount >= FAIL_DECAY_THRESHOLD) {
                cJSON_ReplaceItemInObjectCaseSensitive(obj, "status",  cJSON_CreateNumber(0));
                cJSON_ReplaceItemInObjectCaseSensitive(obj, "decayed", cJSON_CreateTrue());
                set_location_flag(obj);
            }
            failcnt++;
            continue;
        }

        cJSON *info = cJSON_GetObjectItemCaseSensitive(root, "info");
        cJSON *positions = cJSON_GetObjectItemCaseSensitive(root, "positions");
        cJSON *satname_j = info ? cJSON_GetObjectItemCaseSensitive(info, "satname") : NULL;


        if (cJSON_IsString(satname_j))
            cJSON_ReplaceItemInObjectCaseSensitive(obj, "satname", cJSON_CreateString(satname_j->valuestring));
        else if (!cJSON_GetObjectItemCaseSensitive(obj, "satname"))
            cJSON_AddNullToObject(obj, "satname");

        if (cJSON_IsArray(positions) && cJSON_GetArraySize(positions) > 0) {

            int m = cJSON_GetArraySize(positions);
            cJSON *pnew = cJSON_GetArrayItem(positions, m - 1);

            cJSON *lat_j = cJSON_GetObjectItemCaseSensitive(pnew, "satlatitude");
            cJSON *lon_j = cJSON_GetObjectItemCaseSensitive(pnew, "satlongitude");
            cJSON *ts_j  = cJSON_GetObjectItemCaseSensitive(pnew, "timestamp");

            if (cJSON_IsNumber(lat_j) && cJSON_IsNumber(lon_j)) {
                double lat = lat_j->valuedouble, lon = lon_j->valuedouble;
                double ts  = cJSON_IsNumber(ts_j) ? ts_j->valuedouble : (double)now;


                prepend_history_point(obj, lat, lon, ts);


                set_location(obj, lat, lon);


                cJSON_ReplaceItemInObjectCaseSensitive(obj, "status",  cJSON_CreateNumber(1));
                cJSON_ReplaceItemInObjectCaseSensitive(obj, "decayed", cJSON_CreateFalse());
                cJSON_ReplaceItemInObjectCaseSensitive(obj, "failCount", cJSON_CreateNumber(0));

                okcnt++;
            } else {

                failCount++;
                cJSON_ReplaceItemInObjectCaseSensitive(obj, "failCount", cJSON_CreateNumber(failCount));
                if (failCount >= FAIL_DECAY_THRESHOLD) {
                    cJSON_ReplaceItemInObjectCaseSensitive(obj, "status",  cJSON_CreateNumber(0));
                    cJSON_ReplaceItemInObjectCaseSensitive(obj, "decayed", cJSON_CreateTrue());
                    set_location_flag(obj);
                }
                failcnt++;
            }
        } else {

            failCount++;
            cJSON_ReplaceItemInObjectCaseSensitive(obj, "failCount", cJSON_CreateNumber(failCount));
            if (failCount >= FAIL_DECAY_THRESHOLD) {
                cJSON_ReplaceItemInObjectCaseSensitive(obj, "status",  cJSON_CreateNumber(0));
                cJSON_ReplaceItemInObjectCaseSensitive(obj, "decayed", cJSON_CreateTrue());
                set_location_flag(obj);
            }
            failcnt++;
        }

        cJSON_Delete(root);
    }

    fclose(in);
    curl_easy_cleanup(curl);
    curl_global_cleanup();
    free(resp.data);


    char *printed = cJSON_PrintUnformatted(state);
    if (!printed) { fprintf(stderr, "Failed to serialize JSON array\n"); cJSON_Delete(state); return 1; }

    FILE *out = fopen(outpath, "w");
    if (!out) { perror("open output"); free(printed); cJSON_Delete(state); return 1; }
    fprintf(out, "%s\n", printed);
    fclose(out);
    free(printed);
    cJSON_Delete(state);

    printf("Done. Updated %s (%d ok, %d failed)\n", outpath, okcnt, failcnt);
    return (okcnt > 0) ? 0 : 1;
}
