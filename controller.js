/**
 * v0.3+
 * offline mode isn't reliably detected
 * keyboard navigation through most of it?
 * rather than positive amt, positive amt above and beyond dust
 * use bitcoin qr code generator instead
 * reconcile imported vs unlocked terminology
 * when adding funds to unlocked, display add amount plus new balance
 * prevent text overlay when flipping quickly?
 * import, unlock, then go back and wrong password, should probably clear. or don't allow password again
 * clearly state browser requirements
 * allow qr codes to be opened with wallet
 * if invalid mp upload, clear upload form
 * refactor to be truly object-oriented?
 * inconsistent naming convention from _error to _msg
 * realtime amount validations do not report negative amounts
 * display transaction fee on send pages
 * display full balance in confirm
 * automatically import mp after new mp created and funded
 * set expiration date to claim funds before they're returned
 * compute minimum send amount and pre-validate in forms instead of try catch
 * add the envelope back in
 * https
 * gpg encryption
 * Give credit to BitPay for BitCore and recommend CoPay as the best wallet I have used to date
 * Step by step both the features and the process.
 * Sender may continue to add funds to a money packet at any time. (HD coming eventually, if possible)
 * "you will see fluctuations"
 * "prices are updated every minute"
 * special treatment if they give a tip :)
 */

// dependencies
var bitcore = require('bitcore');
var insight = require('bitcore-explorers').Insight();
var sjcl = require ('sjcl');

// instance variables
var page_manager;
var imported_mp;
var imported_private_key;
var imported_public_address;
var imported_listener;
var imported_network_info;
var unlocked_mp_balance;
var claim_mp;
var claim_mp_public_address;
var new_mp;
var new_mp_public_address;
var new_mp_listener;
var new_mp_network_info;
var new_mp_balance;
var exchange_rates = null;
var online = true;

//constants
var NETWORK_REFRESH_RATE = 1000;
var EXCHANGE_RATE_REFRESH_RATE = 60000;
var TIP_ADDRESS = "1B2Bq6YXkguYWwBG68iDGFXzDcN89USryo";
var EDGE_WIDTH = 150;
var PREFERRED_UNIT_DEFAULT = "USD";

// IE workaround
var isIE = /*@cc_on!@*/false || !!document.documentMode;

/**
 * Document initialization.
 */
$(document).ready(function() {
	// general setup
	$(".page").hide();
	$("#background_page").show();
	$("#home_page").show();
	page_manager = new PageManager("home_page");
	$("#left_arrow").addClass("hidden").click(function() { page_manager.prev(); });
	$("#right_arrow").addClass("hidden").click(function() { page_manager.next(); });
	//$("#center_div").width($(window).width() - EDGE_WIDTH);
	//$(window).resize(function() { $("#center_div").width($(window).width() - EDGE_WIDTH); });
	//$("#preferred_unit_div").width($(window).width() - EDGE_WIDTH);
	//$(window).resize(function() { $("#preferred_unit_div").width($(window).width() - EDGE_WIDTH); });
	$.ajaxSetup({ cache: false });
	new exchange_rate_listener(EXCHANGE_RATE_REFRESH_RATE);
	$("#preferred_unit_select").change(on_unit);
	$("#offline_div").hide();
	
	// home page
	$("#home_import_link").click(function() { page_manager.next("import_upload_page"); });
	$("#home_create_link").click(function() { page_manager.next("new_mp_password_page"); });
	
	// import process
	$("#import_paste_link").click(function() { page_manager.next("import_paste_page"); });
	$("#import_paste_textarea").on('input', on_import_paste_textarea);
	$("#import_password").keyup(function(event) { if (event.keyCode == 13) { $("#import_password").blur(); on_unlock(); } });
	$("#unlock_button").click(on_unlock);
	$("#unlocked_claim_mp_link").click(function() { page_manager.next("claim_mp_password_page"); });
	$("#unlocked_claim_address_link").click(function() { page_manager.next("claim_address_page"); });
	$("#unlocked_add_link").click(function() { page_manager.next("unlocked_mp_add_page"); });
	
	// send to new money packet
	$("#claim_mp_set_password_button").click(on_claim_mp_set_password);
	$("#claim_mp_password1").keyup(function(event) { if (event.keyCode == 13) { $("#claim_mp_password1").blur(); on_claim_mp_set_password(); } });
	$("#claim_mp_password2").keyup(function(event) { if (event.keyCode == 13) { $("#claim_mp_password2").blur(); on_claim_mp_set_password(); } });
	$("#claim_mp_download_button").click(on_claim_mp_download);
	$("#claim_mp_download_copy_link").click(function() { page_manager.next("claim_mp_copy_page"); });
	$("#claim_mp_download_confirm_checkbox").click(on_claim_mp_download_confirm_checkbox);
	$("#claim_mp_copy_confirm_checkbox").click(on_claim_mp_copy_confirm_checkbox);
	$("#claim_mp_send_full_balance").click(on_claim_mp_send_full_balance);
	$("#claim_mp_send_button").click(on_claim_mp_send);
	$("#claim_mp_send_amt").on("input", function() { on_claim_mp_send_amt(); });
	$("#claim_mp_done_another_link").click(function() { page_manager.move("unlocked_page"); });
	$("#claim_mp_done_home_link").click(function() { page_manager.move("home_page"); });
	
	// imported send to bitcoin address
	$("#claim_address").on("input", function() { on_claim_address(); });
	$("#claim_address_amt").on("input", function() { on_claim_address_amt(); });
	$("#claim_address_full_balance").click(on_claim_address_full_balance);
	$("#claim_address_send_button").click(on_claim_address_send);
	$("#claim_address_done_another_link").click(function() { page_manager.move("unlocked_page"); });
	$("#claim_address_done_home_link").click(function() { page_manager.move("home_page"); });
	
	// imported add funds
	$("#unlocked_mp_add_amt").on("input", function() { on_unlocked_mp_add_amt(); });
	$("#unlocked_mp_add_another_link").click(function() { page_manager.move("unlocked_page"); });
	$("#unlocked_mp_add_home_link").click(function() { page_manager.move("home_page"); });
	
	// new money packet
	$("#new_mp_set_password_button").click(on_new_mp_set_password);
	$("#new_mp_password1").keyup(function(event) { if (event.keyCode == 13) { $("#new_mp_password1").blur(); on_new_mp_set_password(); } });
	$("#new_mp_password2").keyup(function(event) { if (event.keyCode == 13) { $("#new_mp_password2").blur(); on_new_mp_set_password(); } });
	$("#new_mp_download_button").click(on_new_mp_download);
	$("#new_mp_download_copy_link").click(function() { page_manager.next("new_mp_copy_page"); });
	$("#new_mp_download_confirm_checkbox").click(on_new_mp_download_confirm_checkbox);
	$("#new_mp_copy_confirm_checkbox").click(on_new_mp_copy_confirm_checkbox);
	$("#new_mp_add_amt").on("input", function() { on_new_mp_add_amt(); });
	$("#new_mp_add_home_link").click(function() { page_manager.move("home_page"); });
});

/**
 * Tracks navigation and handles page changes.
 */
function PageManager(start_id) {
	
	var pages = [start_id];
	var idx = 0;
	var that = this;
	update_arrows();
	
	this.current = function() {
		return pages[idx];
	};
	
	this.has = function(id) {
		return pages.indexOf(id) != -1;
	}
	
	this.next = function(id) {
		if (id == null) {
			$('#' + pages[idx++]).toggle("slide", {direction: "left"}, 400);
			$('#' + pages[idx]).toggle("slide", {direction: "right", complete:function() { show_page(pages[idx]); }}, 400);
			update_arrows();
		} else {
			that.clear_nexts();
			init_page(id);
			pages.push(id);
			that.next();
		}
	};
	
	this.prev = function(id) {
		if (id == null) {
			$('#' + pages[idx--]).toggle("slide", {direction: "right"}, 400);
			$('#' + pages[idx]).toggle("slide", {direction: "left", complete:function() { show_page(pages[idx]); }}, 400);
			update_arrows();
		} else {
			that.clear_prevs();
			init_page(id);
			pages.unshift(id);
			idx++;
			that.prev();
		}
	};
	
	this.move = function(id) {
		var targetIdx = pages.indexOf(id);
		if (targetIdx == -1) console.err("Page does not exist: " + id);
		else {
			if (targetIdx < idx) {
				$('#' + pages[idx]).toggle("slide", {direction: "right"}, 400);
				$('#' + pages[targetIdx]).toggle("slide", {direction: "left", complete:function() { show_page(pages[idx]); }}, 400);
			} else if (targetIdx > idx) {
				$('#' + pages[idx]).toggle("slide", {direction: "left"}, 400);
				$('#' + pages[targetIdx]).toggle("slide", {direction: "right", complete:function() { show_page(pages[idx]); }}, 400);
			}
			idx = targetIdx;
			update_arrows();
		}
	}
	
	this.clear_nexts = function() {
		pages.slice(idx + 1).forEach(function(id) {
			clear_page(id);
		});
		pages = pages.slice(0, idx + 1);
		update_arrows();
	}
	
	this.clear_prevs = function() {
		pages.slice(0, idx).forEach(function(id) {
			clear_page(id);
		});
		pages = pages.slice(idx);
		idx = 0;
		update_arrows();
	}
	
	this.remove = function(id) {
		var i = pages.indexOf(id);
		if (i <= idx) idx--;
		clear_page(pages[i]);
		pages.splice(i, 1);
	}
	
	function update_arrows() {
		idx > 0 ? $("#left_arrow").removeClass("hidden") : $("#left_arrow").addClass("hidden");
		idx < pages.length - 1 ? $("#right_arrow").removeClass("hidden") : $("#right_arrow").addClass("hidden");
	}
	
	/**
	 * Initializes the pages.
	 */
	function init_page(id) {
		switch (id) {
		case "import_upload_page":
			$("#import_upload").replaceWith($("#import_upload").val('').clone(true));
			$("#import_upload_error").text("");
			break;
		case "import_paste_page":
			$("#import_paste_textarea").val("");
			$("#import_paste_error").text("");
			break;
		case "unlock_page":
			$("#import_password").val("");
			$("#import_password_error").text("");
			break;
		case "unlocked_page":
			$("#unlocked_balance").text("...");
			imported_listener = new network_listener(imported_public_address, NETWORK_REFRESH_RATE, on_imported_balance);
			imported_network_info = {};
			break;
		case "unlocked_mp_add_page":
			$("#unlocked_mp_qrcode").empty();
			$("#unlocked_mp_qrcode_address").text("");
			$("#unlocked_mp_add_amt").val("");
			$("#unlocked_mp_add_amt_error").text("");
			update_unlocked_mp_unit_labels();
			$("#unlocked_mp_add_btc_conversion").html("&nbsp;");
			
			// draw qr code
			$("#unlocked_mp_qrcode").empty();
			new QRCode("unlocked_mp_qrcode", {
				text:imported_public_address,
				width:125,
				height:125
			});
			$("#unlocked_mp_qrcode_address").text(imported_public_address);
			break;
		case "unlocked_mp_add_done_page":
			$("#unlocked_mp_add_done_amt").text("");
			break;
		case "claim_mp_password_page":
			$("#claim_mp_password1").val("");
			$("#claim_mp_password2").val("");
			$("#claim_mp_password_error").text("");
			break;
		case "claim_mp_download_page":
			$("#claim_mp_download_confirm_checkbox").prop("checked", false);
			break;
		case "claim_mp_copy_page":
			$("#claim_mp_copy_textarea").val(claim_mp);
			$("#claim_mp_copy_confirm_checkbox").prop("checked", false);
			break;
		case "claim_mp_send_page":
			$("#claim_mp_send_amt").val("");
			$("#claim_mp_send_msg").text("");
			$("#claim_mp_send_amt_error").text("");
			update_claim_mp_send_unit_labels();
			update_claim_mp_send_button();
			break;
		case "claim_address_page":
			$("#claim_address").val("");
			$("#claim_address_msg").text("");
			$("#claim_address_amt").val("");
			$("#claim_address_amt_msg").text("");
			$("#claim_address_send_msg").text("");
			clear_canvas("claim_address_checkmark");
			$("#claim_address_full_balance").attr("disabled", "disabled");
			update_claim_address_unit_labels();
			update_claim_address_send_button();
			break;
		case "new_mp_password_page":
			$("#new_mp_password1").val("");
			$("#new_mp_password2").val("");
			$("#new_mp_password_error").text("");
			break;
		case "new_mp_download_page":
			$("#new_mp_download_confirm_checkbox").prop("checked", false);
			new_mp_listener = new network_listener(new_mp_public_address, NETWORK_REFRESH_RATE, on_new_mp_balance);
			new_mp_network_info = {};
			new_mp_balance = 0;
			break;
		case "new_mp_copy_page":
			$("#new_mp_copy_textarea").val(new_mp);
			$("#new_mp_copy_confirm_checkbox").prop("checked", false);
			break;
		case "new_mp_add_page":
			$("#new_mp_qrcode").empty();
			$("#new_mp_qrcode_address").text("");
			$("#new_mp_add_amt").val("");
			$("#new_mp_add_amt_error").text("");
			update_claim_address_unit_labels();
			$("#new_mp_add_btc_conversion").html("&nbsp;");
			
			// draw qr code
			$("#new_mp_qrcode").empty();
			new QRCode("new_mp_qrcode", {
				text:new_mp_public_address,
				width:125,
				height:125
			});
			$("#new_mp_qrcode_address").text(new_mp_public_address);
		case "new_mp_add_done_page":
			break;
		default:
			break;
		}
	}

	/**
	 * Clears page resources.
	 */
	function clear_page(id) {
		switch (id) {
		case "unlocked_page":
			if (imported_listener) imported_listener.stop_listening();
			break;
		case "claim_mp_password_page":
			claim_mp = null;
			claim_mp_public_address = null;
			break;
		case "new_mp_password_page":
			new_mp = null;
			new_mp_public_address = null;
			break;
		case "new_mp_download_page":
			if (new_mp_listener) new_mp_listener.stop_listening();
			break;
		default:
			break;
		}
	}

	/**
	 * Shows the pages.
	 */
	function show_page(id) {
		switch (id) {
		case "import_paste_page":
			$("#import_paste_textarea").focus();
			break;
		case "unlock_page":
			$("#import_password").focus();
			break;
		case "claim_mp_password_page":
			$("#claim_mp_password1").focus();
			break;
		case "claim_address_page":
			$("#claim_address").focus();
			break;
		case "unlocked_mp_add_page":
			$("#unlocked_mp_add_amt").focus();
			break;
		case "new_mp_password_page":
			$("#new_mp_password1").focus();
			break;
		case "claim_mp_send_page":
			$("#claim_mp_send_amt").focus();
		case "new_mp_add_page":
			$("#new_mp_add_amt").focus();
			break;
		default:
			break;
		}
	}
}

function on_import_upload(files) {
	var file = files[0];
	var reader = new FileReader();
	reader.onload = function(event) {
		try {
			imported_mp = JSON.parse(reader.result);
		} catch(err) {
			imported_mp = null;
		}
		if (imported_mp == null || imported_mp.mode == null) {
			$("#import_upload_error").text("Invalid money packet.  Make sure you selected the right file.");
		} else {
			$("#import_upload_error").text("");
			page_manager.next("unlock_page");
		}
	};
	reader.readAsText(file);
}

function on_import_paste_textarea() {
	try {
		imported_mp = JSON.parse($("#import_paste_textarea").val());
	} catch(err) {
		imported_mp = null;
		page_manager.clear_nexts();
	}
	if ($("#import_paste_textarea").val() == "") {
		$("#import_paste_error").text("");
	} else if (imported_mp == null || imported_mp.mode == null) {
		$("#import_paste_error").text("Invalid money packet text.  Copy and paste the entire file contents of your money packet.");
	} else {
		$("#import_paste_error").text("");
		page_manager.next("unlock_page");
	}
}

function on_unlock() {
	try {
		imported_private_key = sjcl.decrypt($("#import_password").val(), JSON.stringify(imported_mp));
		imported_public_address = bitcore.PrivateKey.fromWIF(imported_private_key).toAddress().toString();
		$("#import_password_error").text("");
		unlocked_mp_balance = null;
		page_manager.next("unlocked_page");
	} catch (err) {
		$("#import_password_error").text("Password is incorrect, try again.");
		$("#import_password").val("");
		$("#import_password").focus();
	}
}

/**
 * Called with the latest network info for the imported mp.
 */
function on_imported_balance(err, amt, utxos, tx) {
	if (err != null) {
		set_online(false);
		return;
	}
	if (!online) set_online(true);
	
	// save network info
	imported_network_info.err = err;
	imported_network_info.amt = amt;
	imported_network_info.utxos = utxos;
	imported_network_info.tx = tx;
	
	// if no change, done
	if (unlocked_mp_balance == amt) return;
	unlocked_mp_balance = amt;
	
	// update balance fields
	update_imported_balances();
	update_imported_buttons();
	
	// check if new funds added on add page
	if (page_manager.current() == "unlocked_mp_add_page") {
		page_manager.next("unlocked_mp_add_done_page");
	}
}

function on_unit() {
	update_imported_balances();
	update_new_mp_balances();
	if (page_manager.current() == "new_mp_add_page") on_new_mp_add_amt();
	if (page_manager.current() == "unlocked_mp_add_page") on_unlocked_mp_add_amt();
	if (page_manager.current() == "claim_address_page") on_claim_address_amt();
	if (page_manager.current() == "claim_mp_send_page") on_claim_mp_send_amt();
	update_unlocked_mp_unit_labels();
	update_new_mp_unit_labels();
	update_claim_address_unit_labels();
	update_claim_mp_send_unit_labels();
	if (get_unit_code() != "BTC" && get_unit_code() != "bits") {
		$("#fluctuate").show();
	} else {
		$("#fluctuate").hide();
	}
}

/**
 * Updates all balances for the imported mp.
 */
function update_imported_balances() {
	var amt_str = online ? satoshis_to_unit_str(unlocked_mp_balance) : "unavailable";
	var color = online ? "green" : "red";
	$("#unlocked_balance").css("color", color).text(amt_str);
	$("#claim_mp_send_balance").css("color", color).text(amt_str);
	$("#claim_address_balance").css("color", color).text(amt_str);
	$("#unlocked_mp_add_done_balance").css("color", color).text(amt_str);
	$("#claim_address_done_balance").css("color", color).text(amt_str);
	$("#claim_mp_done_old_balance").css("color", color).text(amt_str);
	if (imported_network_info != null && imported_network_info.tx != null) {
		$("#claim_address_fee").css("color","green").text(satoshis_to_unit_str(imported_network_info.tx.getFee(), 2));
		$("#claim_mp_send_fee").css("color","green").text(satoshis_to_unit_str(imported_network_info.tx.getFee(), 2));
	} else {
		$("#claim_address_fee").css("color","red").text("unavailable");
		$("#claim_mp_send_fee").css("color","red").text("unavailable");
	}
}

function update_new_mp_balances() {
	var amt_str = online ? satoshis_to_unit_str(new_mp_balance) : "unavailable";
	var color = online ? "green" : "red";
	$("#new_mp_add_done_balance").css("color", color).text(amt_str);
}

function update_unlocked_mp_unit_labels() {
	var symbol = get_currency_symbol(get_unit_code());
	if (symbol != null) {
		$("#unlocked_mp_add_symbol").text(symbol);
		$("#unlocked_mp_add_code").text("");
	} else {
		$("#unlocked_mp_add_symbol").text("");
		$("#unlocked_mp_add_code").text(get_unit_code());
	}
}

function update_new_mp_unit_labels() {
	var symbol = get_currency_symbol(get_unit_code());
	if (symbol != null) {
		$("#new_mp_add_symbol").text(symbol);
		$("#new_mp_add_code").text("");
	} else {
		$("#new_mp_add_symbol").text("");
		$("#new_mp_add_code").text(get_unit_code());
	}
}

function update_claim_address_unit_labels() {
	var symbol = get_currency_symbol(get_unit_code());
	if (symbol != null) {
		$("#claim_address_symbol").text(symbol);
		$("#claim_address_code").text("");
	} else {
		$("#claim_address_symbol").text("");
		$("#claim_address_code").text(get_unit_code());
	}
}

function update_claim_mp_send_unit_labels() {
	var symbol = get_currency_symbol(get_unit_code());
	if (symbol != null) {
		$("#claim_mp_send_symbol").text(symbol);
		$("#claim_mp_send_code").text("");
	} else {
		$("#claim_mp_send_symbol").text("");
		$("#claim_mp_send_code").text(get_unit_code());
	}
}

/**
 * Sets the password and generates a claim mp.
 * 
 * DUPLICATE BELOW
 */
function on_claim_mp_set_password() {
	if (claim_mp != null && !confirm("You already created a money packet to transfer funds to.  Discard and start a new one?")) return;
	var password1 = $("#claim_mp_password1");
	var password2 = $("#claim_mp_password2");
	var valid = validate_passwords(password1.val(), password2.val());
	if (valid == "Valid") {
		$("#claim_mp_set_password_error").text("");
		
		// generate private key for claim mp
		var claim_mp_private_key = bitcore.PrivateKey();
		claim_mp_public_address = claim_mp_private_key.toAddress().toString();
		claim_mp = sjcl.encrypt(password1.val(), claim_mp_private_key.toWIF());
		page_manager.next("claim_mp_download_page");
	} else {
		$("#claim_mp_set_password_error").text(valid);
		password1.val("");
		password2.val("");
		password1.focus();
	}
}

/**
 * Sets the password and generates a new mp.
 */
function on_new_mp_set_password() {
	if (new_mp != null && !confirm("You already created a new money packet.  Discard and start a new one?")) return;
	var password1 = $("#new_mp_password1");
	var password2 = $("#new_mp_password2");
	var valid = validate_passwords(password1.val(), password2.val());
	if (valid == "Valid") {
		$("#new_mp_set_password_error").text("");
		
		// generate private key for claim mp
		var new_mp_private_key = bitcore.PrivateKey();
		new_mp_public_address = new_mp_private_key.toAddress().toString();
		new_mp = sjcl.encrypt(password1.val(), new_mp_private_key.toWIF());
		page_manager.next("new_mp_download_page");
	} else {
		$("#new_mp_set_password_error").text(valid);
		password1.val("");
		password2.val("");
		password1.focus();
	}
}

/**
 * Downloads the claim mp.
 * 
 * DUPLICATE BELOW
 */
function on_claim_mp_download() {
	if (isIE) {
		window.navigator.msSaveBlob(new Blob([claim_mp]), "money.bit");
	} else {
		var a = window.document.createElement('a');
		a.href = window.URL.createObjectURL(new Blob([claim_mp], {type: 'application/json'}));
		a.download = 'money.bit';
		a.target="_blank";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}
}

/**
 * Downloads the new mp.
 */
function on_new_mp_download() {
	if (isIE) {
		window.navigator.msSaveBlob(new Blob([new_mp]), "money.bit");
	} else {
		var a = window.document.createElement('a');
		a.href = window.URL.createObjectURL(new Blob([new_mp], {type: 'application/json'}));
		a.download = 'money.bit';
		a.target="_blank";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}
}

/**
 * Confirms that the user has downloaded the claim mp to proceed.
 * 
 * DUPLICATE BELOW
 */
function on_claim_mp_download_confirm_checkbox() {
	if ($("#claim_mp_download_confirm_checkbox").is(":checked")) {
		page_manager.next("claim_mp_send_page");	
	} else {
		page_manager.clear_nexts();
	}
}

/**
 * Confirms that the user has downloaded the new mp to proceed.
 */
function on_new_mp_download_confirm_checkbox() {
	if ($("#new_mp_download_confirm_checkbox").is(":checked")) {
		page_manager.next("new_mp_add_page");	
	} else {
		page_manager.clear_nexts();
	}
}

/**
 * Confirms that the user has copy/pasted the claim mp to proceed.
 * 
 * DUPLICATE BELOW
 */
function on_claim_mp_copy_confirm_checkbox() {
	if ($("#claim_mp_copy_confirm_checkbox").is(":checked")) {
		page_manager.next("claim_mp_send_page");	
	} else {
		page_manager.clear_nexts();
	}
}

/**
 * Confirms that the user has copy/pasted the new mp to proceed.
 */
function on_new_mp_copy_confirm_checkbox() {
	if ($("#new_mp_copy_confirm_checkbox").is(":checked")) {
		page_manager.next("new_mp_add_page");	
	} else {
		page_manager.clear_nexts();
	}
}

function on_claim_mp_send() {
	var send_msg = $("#claim_mp_send_msg");
	if (imported_network_info == null) {
		send_msg.css("color", "red").text("Unable to get money packet network info");
	} else if (imported_network_info.err != null) {
		send_msg.css("color", "red").text("Network error: " + imported_network_info.err);
	} else {
		var send_amt_str = $("#claim_mp_send_amt").val();
		var balance = imported_network_info.amt;
		var tx = imported_network_info.tx;
		var tx_fee = tx.getFee();
		var msg = validate_transfer_amt(send_amt_str, balance, tx_fee);
		if (msg != "Valid") {
			$("#claim_mp_send_amt_error").css("color","red").text(msg);
		} else {
			var send_amt = parseFloat(send_amt_str);
			if (!confirm("Transfer " + satoshis_to_unit_str(unit_to_satoshis(send_amt)) + " to your new money packet?")) return;
			tx.to(claim_mp_public_address, unit_to_satoshis(send_amt, 0)).sign(imported_private_key);
			try {
				insight.broadcast(tx, function(err, txid) {
			    	if (err) {
			    		throw err;
			    	} else {
			    		send_msg.text("");
			    		$("#claim_mp_done_old_balance").css("color", "black").text("..");
			    		$("#claim_mp_done_transfer_amt").css("color", "green").text(satoshis_to_unit_str(unit_to_satoshis(send_amt)));
			    		page_manager.next("claim_mp_done_page");
			    	}
			    });
		    } catch(err) {
		    	if (err.toString().indexOf("Dust amount") != -1) {
	    			send_msg.css("color", "red").text("Send amount is too small.");
	    		} else {
	    			send_msg.css("color", "red").text("Error sending funds: " + err.toString());
	    		}
		    }
		}
	}
}

/**
 * Handles when user types amount into claim mp send page.
 */
function on_claim_mp_send_amt() {
	if (!online) return;
	var amt_str = $("#claim_mp_send_amt").val();
	var balance = imported_network_info.amt;
	var tx = imported_network_info.tx;
	var tx_fee = tx.getFee();
	var msg = validate_transfer_amt(amt_str, balance, tx_fee);
	if (msg == "Amount is not a number" ||
		msg == "Not enough funds" ||
		msg == "Not enough funds with transaction fee") {
		$("#claim_mp_send_amt_error").css("color","red").text(msg);
	} else {
		$("#claim_mp_send_amt_error").text("");
	}
	update_claim_mp_send_button();
}

function on_claim_address() {
	var checkmark = $("#claim_address_checkmark");
	var address = $("#claim_address").val();
	var msg = $("#claim_address_msg");
	$("#claim_address_full_balance").attr("disabled", "disabled");
	if (address == "") {
		checkmark.hide();
		clear_canvas("claim_address_checkmark");
		msg.text("");
	} else {
		var valid = validate_address(address);
		if (valid == "Valid") {
			checkmark.show();
			draw_checkmark("claim_address_checkmark");
			msg.text("");
			$("#claim_address_full_balance").removeAttr("disabled");
		} else {
			checkmark.hide();
			clear_canvas("claim_address_checkmark");
			msg.css("color","red").text(valid);
		}
	}
	update_claim_address_send_button();
}

/**
 * Handles when a user types amount into claim address send page.
 */
function on_claim_address_amt() {
	if (!online) return;
	var amt_str = $("#claim_address_amt").val();
	var balance = imported_network_info.amt;
	var tx = imported_network_info.tx;
	var tx_fee = tx.getFee();
	var msg = validate_transfer_amt(amt_str, balance, tx_fee);
	if (msg == "Amount is not a number" ||
		msg == "Not enough funds" ||
		msg == "Not enough funds with transaction fee") {
		$("#claim_address_amt_msg").css("color","red").text(msg);
	} else {
		$("#claim_address_amt_msg").text("");
	}
	update_claim_address_send_button();
}

function update_claim_mp_send_button() {
	if (!online) {
		$("#claim_mp_send_button").attr("disabled", "disabled");
		return;
	}
	var valid = true;
	if (imported_network_info == null) valid = false;
	if (imported_network_info.err != null) valid = false;
	var send_amt_str = $("#claim_mp_send_amt").val();
	var balance = imported_network_info.amt;
	var tx = imported_network_info.tx;
	var tx_fee = tx.getFee();
	var msg = validate_transfer_amt(send_amt_str, balance, tx_fee);
	if (msg != "Valid") valid = false;
	if (valid) $("#claim_mp_send_button").removeAttr("disabled");
	else $("#claim_mp_send_button").attr("disabled", "disabled");
}

function update_claim_address_send_button() {
	if (!online || imported_network_info == null || imported_network_info.tx == null) {
		$("#claim_address_send_button").attr("disabled", "disabled");
		return;
	}
	var send_address = $("#claim_address").val();
	var send_amt_str = $("#claim_address_amt").val();
	var balance = imported_network_info.amt;
	var tx = imported_network_info.tx;
	var tx_fee = tx.getFee();
	var address_msg = validate_address(send_address);
	var amt_msg = validate_transfer_amt(send_amt_str, balance, tx_fee);
	if (address_msg == "Valid" && amt_msg == "Valid") {
		$("#claim_address_send_button").removeAttr("disabled");
	} else {
		$("#claim_address_send_button").attr("disabled", "disabled");
	}
}

function on_claim_mp_send_full_balance() {
	if (!online) return;
	var send_msg = $("#claim_mp_send_msg");
	if (imported_network_info == null) {
		send_msg.css("color", "red").text("Unable to get money packet network info");
	} else if (imported_network_info.err != null) {
		send_msg.css("color", "red").text("Network error: " + imported_network_info.err);
	} else {
		var send_amt = get_max_send_amt();
		var balance = imported_network_info.amt;
		var tx = imported_network_info.tx;
		var tx_fee = tx.getFee();
		if (send_amt == 0) {
			$("#claim_mp_send_amt_error").css("color","red").text("Insufficient funds to make transaction");
		} else {
			if (!confirm("Transfer the full balance to your new money packet?")) return;
			tx.to(claim_mp_public_address, send_amt).sign(imported_private_key);
			try {
				insight.broadcast(tx, function(err, txid) {
			    	if (err) {
			    		throw err;
			    	} else {
			    		send_msg.text("");
			    		$("#claim_mp_done_old_balance").css("color", "black").text("..");
			    		$("#claim_mp_done_transfer_amt").css("color", "green").text(satoshis_to_unit_str(send_amt));
			    		page_manager.next("claim_mp_done_page");
			    	}
			    });
		    } catch(err) {
		    	if (err.toString().indexOf("Dust amount") != -1) {
	    			send_msg.css("color", "red").text("Send amount is too small.");
	    		} else {
	    			send_msg.css("color", "red").text("Error sending funds: " + err.toString());
	    		}
		    }
		}
	}
}

function on_claim_address_full_balance() {
	if (!online) return;
	var send_msg = $("#claim_address_send_msg");
	if (imported_network_info == null) {
		send_msg.css("color", "red").text("Unable to get money packet network info");
	} else if (imported_network_info.err != null) {
		send_msg.css("color", "red").text("Network error: " + imported_network_info.err);
	} else {
		var send_address = $("#claim_address").val();
		var send_amt = get_max_send_amt();
		var balance = imported_network_info.amt;
		var tx = imported_network_info.tx;
		var tx_fee = tx.getFee();
		var address_msg = validate_address(send_address);
		if (send_amt == 0) {
			$("#claim_address_amt_msg").css("color", "red").text("Insufficient funds to make transaction");
		} else if (address_msg == "Valid") {
    		$("#claim_address_amt_msg").text("");
			if (!confirm("Send the full balance to " + send_address + "?") return;
			tx.to(send_address, send_amt).sign(imported_private_key);
			try {
				insight.broadcast(tx, function(err, txid) {
			    	if (err) {
			    		throw err;
			    	} else {
			    		send_msg.text("");
			    		$("#claim_address_done_transfer_amt").css("color", "green").text(satoshis_to_unit_str(send_amt));
			    		$("#claim_address_done_address").text(send_address);
			    		$("#claim_address_done_balance").css("color","black").text("..");
			    		page_manager.next("claim_address_done_page");
			    	}
			    });
		    } catch(err) {
		    	if (err.toString().indexOf("Dust amount") != -1) {
	    			send_msg.css("color", "red").text("Send amount is too small.");
	    		} else {
	    			send_msg.css("color", "red").text("Error sending funds: " + err.toString());
	    		}
		    }
		} else {
			$("#claim_address_msg").css("color","red").text(address_msg);
		}
	}
}

function get_max_send_amt() {
	return Math.max(0, imported_network_info.amt - imported_network_info.tx.getFee());
}

function on_claim_address_send() {
	var send_msg = $("#claim_address_send_msg");
	if (imported_network_info == null) {
		send_msg.css("color", "red").text("Unable to get money packet network info");
	} else if (imported_network_info.err != null) {
		send_msg.css("color", "red").text("Network error: " + imported_network_info.err);
	} else {
		var send_address = $("#claim_address").val();
		var send_amt_str = $("#claim_address_amt").val();
		var balance = imported_network_info.amt;
		var tx = imported_network_info.tx;
		var tx_fee = tx.getFee();
		var address_msg = validate_address(send_address);
		var amt_msg = validate_transfer_amt(send_amt_str, balance, tx_fee);
		if (address_msg == "Valid" && amt_msg == "Valid") {
			var send_amt = parseFloat(send_amt_str);
			if (!confirm("Transfer " + satoshis_to_unit_str(unit_to_satoshis(send_amt)) + " to " + send_address + "?") return;
			tx.to(send_address, unit_to_satoshis(send_amt, 0)).sign(imported_private_key);
			try {
				insight.broadcast(tx, function(err, txid) {
			    	if (err) {
			    		throw err;
			    	} else {
			    		send_msg.text("");
			    		$("#claim_address_done_transfer_amt").css("color", "green").text(satoshis_to_unit_str(unit_to_satoshis(send_amt)));
			    		$("#claim_address_done_address").text(send_address);
			    		$("#claim_address_done_balance").css("color","black").text("..");
			    		page_manager.next("claim_address_done_page");
			    	}
			    });
		    } catch(err) {
		    	if (err.toString().indexOf("Dust amount") != -1) {
	    			send_msg.css("color", "red").text("Send amount is too small.");
	    		} else {
	    			send_msg.css("color", "red").text("Error sending funds: " + err.toString());
	    		}
		    }
		} else {
			if (address_msg != "Valid") $("#claim_address_msg").css("color","red").text(address_msg);
			if (amt_msg != "Valid") $("#claim_address_amt_msg").css("color","red").text(amt_msg);
		}
	}
}

/**
 * Handles when user types amount into unlocked mp add funds page.
 * 
 * DUPLICATE BELOW
 */
function on_unlocked_mp_add_amt() {
	var amt = $("#unlocked_mp_add_amt").val();
	var msg = validate_positive_amt(amt);
	var error = $("#unlocked_mp_add_amt_error");
	if (msg == "Valid") {
		error.text("");
		var amt_num = satoshis_to_btc(unit_to_satoshis(parseFloat(amt)));
		$("#unlocked_mp_add_btc_conversion").text(amt_num + " BTC");
		
		// incorporate into QR code
		$("#unlocked_mp_qrcode").empty();
		new QRCode("unlocked_mp_qrcode", {
			text:"bitcoin:" + imported_public_address + "?amount=" + amt_num,
			width:125,
			height:125
		});
	} else {
		// TODO: this logic misses negative values which should be flagged in real time
		if (amt != "." && msg == "Amount is not a number") {
			error.css("color", "red").text(msg);
		} else {
			error.text("");
		}
		$("#unlocked_mp_add_btc_conversion").html("&nbsp;");
		
		// remove from QR code
		$("#unlocked_mp_qrcode").empty();
		new QRCode("unlocked_mp_qrcode", {
			text:imported_public_address,
			width:125,
			height:125
		});
	}
}

/**
 * Handles when user types amount into new mp add funds page.
 */
function on_new_mp_add_amt() {
	var amt = $("#new_mp_add_amt").val();
	var msg = validate_positive_amt(amt);
	var error = $("#new_mp_add_amt_error");
	if (msg == "Valid") {
		error.text("");
		var amt_num = satoshis_to_btc(unit_to_satoshis(parseFloat(amt)));
		$("#new_mp_add_btc_conversion").text(amt_num + " BTC");
		
		// redraw into QR code
		$("#new_mp_qrcode").empty();
		new QRCode("new_mp_qrcode", {
			text:"bitcoin:" + new_mp_public_address + "?amount=" + amt_num,
			width:125,
			height:125
		});
	} else {
		if (amt != "." && msg == "Amount is not a number") {
			error.css("color", "red").text(msg);
		} else {
			error.text("");
		}
		$("#new_mp_add_btc_conversion").html("&nbsp;");
		
		// redraw from QR code
		$("#new_mp_qrcode").empty();
		new QRCode("new_mp_qrcode", {
			text:new_mp_public_address,
			width:125,
			height:125
		});
	}
}

function on_new_mp_balance(err, amt, utxos, tx) {
	if (err != null) {
		set_online(false);
		return;
	}
	if (!online) set_online(true);
	
	// save network info
	new_mp_network_info.err = err;
	new_mp_network_info.amt = amt;
	new_mp_network_info.utxos = utxos;
	new_mp_network_info.tx = tx;
	
	// if balances are the same, done
	if (new_mp_balance == amt) return;
	new_mp_balance = amt;
	
	// update balance fields
	update_new_mp_balances();
	
	// advance page if new funds received
	if (page_manager.current() == "new_mp_add_page") {
		page_manager.next("new_mp_add_done_page");
	}
}

function satoshis_to_unit_str(amt, decimals) {
	if (decimals == null) decimals = 2;
	if (get_unit_code() == "BTC") return satoshis_to_unit(amt) + " BTC";
	if (get_unit_code() == "bits") return satoshis_to_unit(amt).toFixed(0) + " bits";
	var symbol = get_currency_symbol(get_unit_code());
	if (symbol != null) {
		return symbol + satoshis_to_unit(amt).toFixed(decimals);
	} else {
		return satoshis_to_unit(amt).toFixed(decimals) + " " + get_unit_code();
	}
}

function satoshis_to_unit(amt, decimals) {
	var converted = amt / 100000000 * get_exchange_rate(get_unit_code());	// TODO: use number library
	return decimals == null ? converted : parseFloat(converted.toFixed(decimals));
}

function unit_to_satoshis(amt, decimals) {
	var converted = amt / get_exchange_rate(get_unit_code()) * 100000000;	// TODO: use number library
	return decimals == null ? converted : parseFloat(converted.toFixed(decimals));
}

function get_unit_code() {
	return $("#preferred_unit_select :selected").val();
}

function get_exchange_rate(code) {
	if (code == "bits") return 1000000.0;
	if (code == "BTC") return 1.0;
	for (var i = 0; i < exchange_rates.length; i++) {
		if (exchange_rates[i].code == code) return exchange_rates[i].rate;
	}
	return null;
}

function set_online(is_online) {
	online = is_online;
	update_imported_buttons();
	if (online) {
		update_exchange_rates();
		$("#offline_div").hide();
		$("#new_mp_add_waiting").text("Waiting for funds...");
		$("#unlocked_mp_add_waiting").text("Waiting for funds...");
	} else {
		$("#offline_div").show();
		$("#new_mp_add_waiting").text("Cannot get balance while offline");
		$("#unlocked_mp_add_waiting").text("Cannot get balance while offline");
	}
	update_imported_balances();
	update_new_mp_balances();
}

function update_imported_buttons() {
	if (!online || unlocked_mp_balance == 0) {
		$("#unlocked_claim_mp_link").attr("disabled", "disabled");
		$("#unlocked_claim_address_link").attr("disabled", "disabled");
	} else {
		$("#unlocked_claim_mp_link").removeAttr("disabled");
		$("#unlocked_claim_address_link").removeAttr("disabled");
	}
}

// ------------------------------- UTILITIES ----------------------------

/**
 * Listens to an address's balance.
 */
function network_listener(address, update_interval, callback) {
	var listening = true;
	this.stop_listening = function() { listening = false; };
	this.listening = function() { return listening; };
	this.callback = function() { get_balance_utxos_tx(address, callback); };
	timer(this, update_interval);
}

/**
 * Repeatedly invokes the listener's callback each interval until
 * listener.stop() is true.
 */
function timer(listener, interval) {
	if (listener.listening()) {
		listener.callback();
		setTimeout(function() {
			timer(listener, interval);
		}, interval);
	}
}

/**
 * Repeatedly gets latest exchange rate data every update_interval ms.
 */
function exchange_rate_listener(update_interval) {
	this.listening = function() { return true; };
	this.callback = update_exchange_rates;
	timer(this, update_interval);
}

/**
 * Updates exchange rate data.
 */
function update_exchange_rates() {
	jQuery.getJSON("https://bitpay.com/api/rates", null, function(data, textStatus, jqXHR) {
		if (data != null) {
			var select = $("#preferred_unit_select");
			if (!exchange_rates) {
				data.forEach(function(obj) {
					if (obj.code != "BTC") select.append($("<option></option>").attr("value", obj.code).text(obj.code));
				});
				$("#preferred_unit_select option:contains('" + PREFERRED_UNIT_DEFAULT + "')").prop("selected", true);
				exchange_rates = data;
				on_unit();
			} else {
				exchange_rates = data;
			}
		}
	});
}

/**
 * Converts the given amount from satoshis to btc.
 */
function satoshis_to_btc(amt) {
	return bitcore.Unit.fromSatoshis(amt).toBTC();
}

/**
 * Converts the given amount from btc to satoshis.
 */
function btc_to_satoshis(amt) {
	return bitcore.Unit.fromBTC(amt).toSatoshis();
}

/**
 * Retrieves the UTXOs, balance, and prepared transaction for the given address.
 *
 * @param address is the address to retrieve for
 * @param callback(err, utxos, amt, tx)
 */
function get_balance_utxos_tx(address, callback) {
	insight.getUnspentUtxos(address, function(err, utxos) {
		if (err) {
			callback(err);
			return;
		}
		var amt = 0;
		for (var i = 0; i < utxos.length; i++) {
			amt += utxos[i].satoshis;
		}
		var tx = bitcore.Transaction().from(utxos).change(address);
		callback(null, amt, utxos, tx);
	});
}

/**
 * Validates two passwords.
 */
function validate_passwords(password1, password2) {
	if (password1 != password2) {
		return "The passwords you entered do not match";
	} else if (password1 == "") {	
		return "The password cannot be blank";
	} else if (password1.length < 5) {
		return "The password must be at least 5 characters";
	} else {
		return "Valid";
	}
}

/**
 * Validates a transfer amount based on available balance and transaction fee.
 * 
 * @param amt is the amount to transfer specified in the user's preferred unit
 * @param balance is the available balance in satoshis
 * @param tx_fee is the estimated transaction fee in satoshis
 */
function validate_transfer_amt(amt, balance, tx_fee) {
	var msg = validate_positive_amt(amt);
	if (msg != "Valid") return msg;
	
	// convert to float and satoshis
	var amt_num = unit_to_satoshis(parseFloat(amt));
	
	// verify amount relative to balance and tx fee
	if (balance == null) {
		console.error("Balance is null");
		return "Balance is null";
	} else if (tx_fee == null) {
		return "Transaction fee is null";
	} else if (amt_num > balance) {
		return "Not enough funds";
	} else if (amt_num > balance - tx_fee) {
		return "Not enough funds with transaction fee";
	} else {
		return "Valid";
	}
}

/**
 * Validates an amount as a positive float.
 */
function validate_positive_amt(amt) {
	if (amt == "" || amt == ".") return "Amount is blank";
	if (!$.isNumeric(amt)) return "Amount is not a number";
	var amt_num = parseFloat(amt);
	if (amt_num <= 0) return "Amount must be positive";
	return "Valid";
}

/**
 * Validates a bitcoin address.
*/
function validate_address(address) {
	if (address == "") {
		return "Address is blank"
	} else if (!bitcore.Address.isValid(address)) {
		return "Bitcoin address is not valid"
	} else {
		return "Valid";
	}
}

function get_currency_symbol(code) {
	var currency_symbols = {
	    'USD': '$', // US Dollar
	    'EUR': '€', // Euro
	    'CRC': '₡', // Costa Rican Colón
	    'GBP': '£', // British Pound Sterling
	    'ILS': '₪', // Israeli New Sheqel
	    'INR': '₹', // Indian Rupee
	    'JPY': '¥', // Japanese Yen
	    'KRW': '₩', // South Korean Won
	    'NGN': '₦', // Nigerian Naira
	    'PHP': '₱', // Philippine Peso
	    'PLN': 'zł', // Polish Zloty
	    'PYG': '₲', // Paraguayan Guarani
	    'THB': '฿', // Thai Baht
	    'UAH': '₴', // Ukrainian Hryvnia
	    'VND': '₫', // Vietnamese Dong
	};
	var symbol = currency_symbols[code];
	return symbol === undefined ? null : symbol;
} 

// --------------------------------- DRAW CHECKMARK ---------------------------

/**
 * Draws a checkmark in the given canvas by id.
 */
function draw_checkmark(canvas_id) {
	var start = 100;
	var mid = 145;
	var end = 250;
	var width = 22;
	var leftX = start;
	var leftY = start;
	var rightX = mid - (width / 2.7);
	var rightY = mid + (width / 2.7);
	var animationSpeed = 4;

	var ctx = document.getElementById(canvas_id).getContext('2d');
	ctx.lineWidth = width;
	ctx.strokeStyle = 'rgba(0, 150, 0, 1)';

	for (i = start; i < mid; i++) {
	    var drawLeft = window.setTimeout(function () {
	        ctx.beginPath();
	        ctx.moveTo(start, start);
	        ctx.lineTo(leftX, leftY);
	        ctx.stroke();
	        leftX++;
	        leftY++;
	    }, 1 + (i * animationSpeed) / 3);
	}

	for (i = mid; i < end; i++) {
	    var drawRight = window.setTimeout(function () {
	        ctx.beginPath();
	        ctx.moveTo(leftX, leftY);
	        ctx.lineTo(rightX, rightY);
	        ctx.stroke();
	        rightX++;
	        rightY--;
	    }, 1 + (i * animationSpeed) / 3);
	}
}

/**
 * Clears the given canvas by id.
 */
function clear_canvas(canvas_id) {
	var canvas = document.getElementById(canvas_id);
	var ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height)
}