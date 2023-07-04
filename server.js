const express = require('express');
const Web3 = require('web3');
const { toChecksumAddress } = require('ethereumjs-util');
const dotenv = require('dotenv');

const app = express();
app.use(express.json());
dotenv.config();

// Connexion à votre réseau Ethereum avec Web3.js
const providerUrl = process.env.PROVIDER_URL;
const web3 = new Web3(providerUrl);

// Adresse du contrat "Commandes"
const commandesContractAddress = process.env.COMMANDES_CONTRACT_ADDRESS;
const commandesContractAbi = require('./CommandesContractABI.json');
const commandesContract = new web3.eth.Contract(commandesContractAbi, commandesContractAddress);

// Adresse du contrat "Transactions"
const transactionsContractAddress = process.env.TRANSACTIONS_CONTRACT_ADDRESS;
const transactionsContractAbi = require('./TransactionsContractABI.json');
const transactionsContract = new web3.eth.Contract(transactionsContractAbi, transactionsContractAddress);

// Route pour ajouter un article
app.post('/articles', async (req, res) => {
  const { name, weight, seller } = req.body;

  // Appel à la fonction "addArticle" du contrat "Commandes"
  const addArticle = commandesContract.methods.addArticle(name, weight, seller);
  const gas = await addArticle.estimateGas();
  const data = addArticle.encodeABI();

  // Création de la transaction
  const tx = {
    from: process.env.WALLET_ADDRESS,
    to: commandesContractAddress,
    gas,
    data,
  };

  // Signature et envoi de la transaction
  const signedTx = await web3.eth.accounts.signTransaction(tx, process.env.PRIVATE_KEY);
  const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

  // Récupération de l'ID de l'article ajouté depuis les logs de la transaction
  const event = receipt.events.ArticleAdded;
  const articleId = event.returnValues.id;

  res.json({ articleId });
});

// Route pour valider un article
app.post('/articles/:id/validate', async (req, res) => {
  const { id } = req.params;

  // Appel à la fonction "validateArticle" du contrat "Commandes"
  const validateArticle = commandesContract.methods.validateArticle(id);
  const gas = await validateArticle.estimateGas();
  const data = validateArticle.encodeABI();

  // Création de la transaction
  const tx = {
    from: process.env.WALLET_ADDRESS,
    to: commandesContractAddress,
    gas,
    data,
  };

  // Signature et envoi de la transaction
  const signedTx = await web3.eth.accounts.signTransaction(tx, process.env.PRIVATE_KEY);
  const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

  res.json({ success: true });
});

// Route pour effectuer un achat
app.post('/articles/:id/buy', async (req, res) => {
  const { id } = req.params;

  // Appel à la fonction "buyArticle" du contrat "Transactions"
  const buyArticle = transactionsContract.methods.buyArticle(id);
  const gas = await buyArticle.estimateGas();
  const data = buyArticle.encodeABI();
  const value = web3.utils.toWei(req.body.amount, 'ether'); // Montant de l'achat en ethers

  // Création de la transaction
  const tx = {
    from: process.env.WALLET_ADDRESS,
    to: transactionsContractAddress,
    gas,
    data,
    value,
  };

  // Signature et envoi de la transaction
  const signedTx = await web3.eth.accounts.signTransaction(tx, process.env.PRIVATE_KEY);
  const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

  res.json({ success: true });
});

// Route pour obtenir les commandes en cours
app.get('/commandes', async (req, res) => {
    const commandes = [];

    // Récupérer les informations de chaque article en cours depuis le contrat "Commandes"
    for (let i = 1; i <= commandesContract.articleCount; i++) {
        const [name, weight, seller, isValidated] = await commandesContract.methods.getArticle(i).call();
        if (!isValidated) {
            commandes.push({id: i, name, weight, seller});
        }
    }

    res.json({ commandes });
});

// Route pour obtenir les transactions validées et effectuées
app.get('/transactions', async (req, res) => {
    const transactions = [];
  
    // Récupérer les informations de chaque transaction validée depuis le contrat "Transactions"
    for (let i = 1; i <= transactionsContract.transactionCount; i++) {
      const completed = await transactionsContract.methods.transactionCompleted(i).call();
      if (completed) {
        const event = await transactionsContract.getPastEvents('TransactionCompleted', {
          filter: { articleId: i },
          fromBlock: 0,
          toBlock: 'latest'
        });
        const amount = event[0].returnValues.amount;
  
        transactions.push({ articleId: i, amount });
      }
    }
  
    res.json({ transactions });
});  

// Démarrage du serveur
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
