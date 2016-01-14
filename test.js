var chess = require('./garbochess.js');

chess.resetGame();
chess.initializeFromFen('rnbqkbnr/pp3ppp/2p1p3/1B1P4/4p3/5P2/PPP3PP/RNBQK1NR b KQkq -');
console.log(chess.getFen());

chess.search(function(bestMove, value, timeTaken, ply){
  console.log(chess.getMoveSAN(bestMove));
}, 99, null);
