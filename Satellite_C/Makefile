CC = gcc
CFLAGS = -O2 -Wall
LDFLAGS =
LIBS = -lcurl              
SRC = satellite.c cJSON.c
BIN = satellite

all: $(BIN)

$(BIN): $(SRC)
	$(CC) $(CFLAGS) -o $@ $(SRC) $(LDFLAGS) $(LIBS)

# Run the fetcher using sats.txt as input
# N2YO_API_KEY must be set in your shell (not committed)
fetch: $(BIN)
	N2YO_API_KEY=$$N2YO_API_KEY ./$(BIN) ./sats.txt

clean:
	rm -f $(BIN)
