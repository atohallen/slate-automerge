/**
 * The Slate client.
 */

import { applySlateOperations } from "../libs/slateOpsToAutomerge"
import { convertAutomergeToSlateOps } from "../libs/convertAutomergeToSlateOps"
import { Editor } from 'slate-react'
import { Value } from 'slate'
import Automerge from 'automerge'
import Immutable from "immutable";
import React from 'react'
import EditList from 'slate-edit-list'
import automergeJsonToSlate from "../libs/automergeJsonToSlate"
import './client.css';


const plugin = EditList();
const plugins = [plugin];

function renderNode(props) {
    const { node, attributes, children, editor } = props;
    const isCurrentItem = plugin.utils
        .getItemsAtRange(editor.value)
        .contains(node);

    switch (node.type) {
        case 'ul_list':
            return <ul {...attributes}>{children}</ul>;
        case 'ol_list':
            return <ol {...attributes}>{children}</ol>;

        case 'list_item':
            return (
                <li
                    className={isCurrentItem ? 'current-item' : ''}
                    title={isCurrentItem ? 'Current Item' : ''}
                    {...props.attributes}
                >
                    {props.children}
                </li>
            );

        case 'paragraph':
            return <div {...attributes}>{children}</div>;
        case 'heading':
            return <h1 {...attributes}>{children}</h1>;
        default:
            return <div {...attributes}>{children}</div>;
    }
}


export class Client extends React.Component {

    constructor(props) {
        super(props)

        this.onChange = this.onChange.bind(this)

        this.doc = Automerge.init();
        this.docSet = new Automerge.DocSet()

        this.connection = new Automerge.Connection(
            this.docSet,
            (msg) => {
                this.props.sendMessage(this.props.clientId, msg)
            }
        )

        const initialValue = automergeJsonToSlate({
            "document": { ...this.doc.note }
        })
        const initialSlateValue = Value.fromJSON(initialValue)

        this.state = {
            value: initialSlateValue,
            online: this.props.online,
        }
    }

    componentDidMount = () => {
        this.initializeConnection()
    }

    componentWillUnmount = () => {
        this.props.connectionHandler(this.props.clientId, false)
    }

    initializeConnection = () => {
        this.connection.open()
        this.docSet.setDoc(this.props.docId, this.doc)
        this.props.sendMessage(this.props.clientId, {
            docId: this.props.docId,
            clock: Immutable.Map(),
        })
        this.props.connectionHandler(this.props.clientId, true)
    }

    /***************************************
     * UPDATE CLIENT FROM REMOTE OPERATION *
     ***************************************/
    /**
     * @function updateWithRemoteChanges
     * @desc Update the Automerge document with changes from another client
     * @param {Array} msg - A message created by Automerge.Connection
     */
    updateWithRemoteChanges = (msg) => {
        console.debug(`Client ${this.props.clientId} received message:`)
        console.debug(msg)
        const currentDoc = this.docSet.getDoc(this.props.docId)
        const docNew = this.connection.receiveMsg(msg)
        const opSetDiff = Automerge.diff(currentDoc, docNew)
        if (opSetDiff.length !== 0) {
            this.updateWithAutomergeOperations(opSetDiff, currentDoc);
        }
    }

    /**
     * @function updateWithAutomergeOperations
     * @desc Update the client with a list of Automerge operations. If an error
     *     occurs, reload the document using Automerge as the ground truth.
     * @param {Array} opSetDiff - The Automerge operations generated by Automerge.diff
     */
    updateWithAutomergeOperations = (opSetDiff) => {
        // Convert the changes from the Automerge document to Slate operations
        try {
            const slateOps = convertAutomergeToSlateOps(opSetDiff)
            const change = this.state.value.change()

            // Apply the operation
            change.applyOperations(slateOps)
            this.setState({ value: change.value })
        } catch (e) {
            // If an error occurs, release the Slate Value based on the Automerge
            // document, which is the ground truth.
            console.debug("The following warning is fine:")
            console.debug(e)
            this.updateSlateFromAutomerge()
        }
    }

    /**
     * @function updateSlateFromAutomerge
     * @desc Directly update the Slate Value from Automerge, ignoring Slate
     *     operations. This is not preferred when syncing documents since it
     *     causes a re-render and loss of cursor position (and on mobile,
     *     a re-render drops the keyboard).
     */
    updateSlateFromAutomerge = () => {
        const doc = this.docSet.getDoc(this.props.docId)
        const newJson = automergeJsonToSlate({
            "document": { ...doc.note }
        })
        this.setState({ value: Value.fromJSON(newJson) })
    }

    /**************************************
     * Handle online/offline connections  *
     **************************************/
    /**
     * @function toggleConnection
     * @desc Turn the client online or offline
     * @param {Event} event - A Javascript Event
     */
    toggleConnectionButton = (event) => {
        this.toggleConnection(!this.state.online);
    }

    /**
     * @function toggleConnection
     * @desc When client goes online/offline, alert the server and open/close
     *     the connection
     * @param {boolean} isOnline - If the client should be online.
     */
    toggleConnection = (isOnline) => {
        if (isOnline) {
            this.props.connectionHandler(this.props.clientId, true)
            this.connection.open()
            let clock = this.docSet.getDoc(this.props.docId)._state.getIn(['opSet', 'clock']);
            this.props.sendMessage(this.props.clientId, {
                docId: this.props.docId,
                clock: clock,
            })
        } else {
            this.connection.close()
            this.props.connectionHandler(this.props.clientId, false)
        }
        this.setState({ online: isOnline })
    }

    /**************************************
     * UPDATE CLIENT FROM LOCAL OPERATION *
     **************************************/
    onChange = ({ operations, value }) => {
        this.setState({ value: value })
        const currentDoc = this.docSet.getDoc(this.props.docId)
        if (currentDoc) {
            const docNew = Automerge.change(currentDoc, `Client ${this.props.clientId}`, doc => {
                // Use the Slate operations to modify the Automerge document.
                applySlateOperations(doc, operations)
            })
            this.docSet.setDoc(this.props.docId, docNew);
        }
    }

    /********************
     * Render functions *
     ********************/
    /**
     * @function renderHeader
     * @desc Render the header for the client.
     */
    renderHeader = () => {
        let onlineText = this.state.online ? "CURRENTLY LIVE SYNCING" : "CURRENTLY OFFLINE";
        let onlineTextClass = this.state.online ? "client-online-text green" : "client-online-text red";
        let toggleButtonText = this.state.online ? "GO OFFLINE" : "GO ONLINE";

        let actorId = this.doc._actorId;
        actorId = actorId.substr(0, actorId.indexOf("-"))

        return (
            <div>
                <table className={"client-header"}>
                    <tbody>
                        <tr><td colSpan="2" className={onlineTextClass}>{onlineText}</td></tr>
                        <tr>
                            <td>Client: {this.props.clientId}</td>
                            <td><button className="client-online-button" onClick={this.toggleConnectionButton}>{toggleButtonText}</button></td>
                        </tr>
                        <tr>
                            <td>{this.props.debuggingMode && <span>Actor Id: {actorId}</span>}</td>
                            <td><button className="client-online-button" onClick={this.updateSlateFromAutomerge}>Sync Slate</button></td>
                        </tr>
                    </tbody>
                </table>
                <hr></hr>
            </div>
        )
    }

    /**
     * @function renderInternalClock
     * @desc Render the internal clock of Automerge.DocSet for debugging purposes.
     */
    renderInternalClock = () => {
        try {
            let clockList = this.docSet.getDoc(this.props.docId)._state.getIn(['opSet', 'clock']);
            let clockComponents = [];
            clockList.forEach((value, actorId) => {
                actorId = actorId.substr(0, actorId.indexOf("-"))
                clockComponents.push(
                    <tr key={`internal-clock-${actorId}`}>
                        <td className="table-cell-left">{actorId}</td>
                        <td className="table-cell-right">{value}</td>
                    </tr>
                )
            })
            return (
                <div>
                    <div>Internal clock:</div>
                    <table>
                        <thead>
                            <tr>
                                <td className="table-cell-left table-cell-header">Actor Id</td>
                                <td className="table-cell-right table-cell-header">Clock</td>
                            </tr>
                        </thead>
                        <tbody>
                            {clockComponents}
                        </tbody>
                    </table>
                </div>
            )
        } catch (err) {
            return null;
        }
    }

    render = () => {
        return (
            <div>
                {this.renderHeader()}
                <table className="client-table"><tbody><tr>
                    <td className="client-editor">
                        <Editor
                            key={this.props.clientId}
                            ref={(e) => { this.editor = e }}
                            value={this.state.value}
                            onChange={this.onChange}
                            renderNode={renderNode}
                            plugins={plugins}
                        />
                    </td>
                    {this.props.debuggingMode && <td className="client-internal">
                        {this.renderInternalClock()}
                    </td>}
                </tr></tbody></table>
            </div>
        )
    }
}
