CC=gcc
CFLAGS=-O2 -Wall
LIBS=$(shell pkg-config --libs libcurl)
CFLAGS+=$(shell pkg-config --cflags libcurl)

all: satellite

satellite: satellite.c cJSON.c
	$(CC) $(CFLAGS) satellite.c cJSON.c -o satellite $(LIBS)

clean:
	rm -f satellite
